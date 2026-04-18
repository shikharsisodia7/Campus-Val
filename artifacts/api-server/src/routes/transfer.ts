import { Router, type IRouter } from "express";
import { EvaluateTransferBody } from "@workspace/api-zod";

const router: IRouter = Router();

const TRANSFER_CAP = 87.5;

router.post("/transfer/evaluate", (req, res) => {
  const body = EvaluateTransferBody.parse(req.body);
  const evaluations = [];
  let runningTotal = body.currentTransferUnits;
  let totalAcceptedThisRequest = 0;
  let cappedAt875 = false;
  const globalWarnings: string[] = [];

  if (body.unitsCompletedAtSCU > 0) {
    globalWarnings.push(
      "You are already enrolled at SCU. Outside coursework now requires WRITTEN advance approval from your dean's office.",
    );
  }
  if (runningTotal >= TRANSFER_CAP) {
    cappedAt875 = true;
    globalWarnings.push(
      `You have already reached the ${TRANSFER_CAP}-quarter-unit transfer cap. No additional transfer credit can be applied.`,
    );
  }

  for (const c of body.courses) {
    const warnings: string[] = [];
    const relatedPolicyIds: string[] = [];
    const scuQuarterUnits =
      c.unitSystem === "semester" ? Number(c.units) * 1.5 : Number(c.units);
    let accepted = true;
    let reason = "";

    // Grade check — most institutions need C or better to transfer
    const gradeUpper = c.grade.toUpperCase().trim();
    const lowGrades = ["C-", "D+", "D", "D-", "F", "NP", "W"];
    if (lowGrades.includes(gradeUpper)) {
      accepted = false;
      reason = `Grade of ${c.grade} is below SCU's transfer minimum (C or better required).`;
      relatedPolicyIds.push("prereq-grade-requirement");
    }

    // Post-enrollment rule
    if (accepted && c.takenAfterSCUEnrollment) {
      if (!c.institutionType || c.institutionType === "community_college") {
        warnings.push(
          "Taken at a community college AFTER SCU enrollment — requires written advance approval from your dean's office. Without it, this credit will NOT transfer.",
        );
      } else {
        warnings.push(
          "Taken AFTER SCU enrollment — requires written advance approval from your dean's office.",
        );
      }
      relatedPolicyIds.push("post-enrollment-transfer");
    }

    // 87.5 cap check after all combined units
    if (accepted) {
      if (runningTotal + scuQuarterUnits > TRANSFER_CAP) {
        const remaining = Math.max(0, TRANSFER_CAP - runningTotal);
        if (remaining <= 0) {
          accepted = false;
          reason = `Already at the ${TRANSFER_CAP}-unit transfer cap. None of these units can transfer.`;
          cappedAt875 = true;
        } else {
          warnings.push(
            `Only ${remaining.toFixed(1)} of ${scuQuarterUnits.toFixed(1)} quarter units fit before the ${TRANSFER_CAP}-unit cap. The rest is lost.`,
          );
          cappedAt875 = true;
        }
        relatedPolicyIds.push("transfer-cap-87.5");
      }
    }

    // Community college after 87.5 hard rule
    if (
      accepted &&
      c.institutionType === "community_college" &&
      runningTotal >= TRANSFER_CAP
    ) {
      accepted = false;
      reason =
        "Two-year college coursework cannot be accepted once you are at or past the 87.5 quarter-unit transfer cap.";
      relatedPolicyIds.push("transfer-cap-87.5");
    }

    if (c.unitSystem === "semester") {
      relatedPolicyIds.push("quarter-to-semester");
    }

    if (accepted && !reason) {
      reason = `Accepted as ${scuQuarterUnits.toFixed(1)} SCU quarter units.`;
    }

    if (accepted) {
      const acceptedUnits = Math.min(
        scuQuarterUnits,
        Math.max(0, TRANSFER_CAP - runningTotal),
      );
      runningTotal += acceptedUnits;
      totalAcceptedThisRequest += acceptedUnits;
    }

    evaluations.push({
      input: c,
      scuQuarterUnits: Math.round(scuQuarterUnits * 10) / 10,
      accepted,
      reason,
      warnings,
      relatedPolicyIds: Array.from(new Set(relatedPolicyIds)),
    });
  }

  res.json({
    evaluations,
    totalAcceptedQuarterUnits:
      Math.round(totalAcceptedThisRequest * 10) / 10,
    runningTransferTotal: Math.round(runningTotal * 10) / 10,
    transferCapRemaining: Math.max(
      0,
      Math.round((TRANSFER_CAP - runningTotal) * 10) / 10,
    ),
    cappedAt875,
    globalWarnings,
  });
});

export default router;
