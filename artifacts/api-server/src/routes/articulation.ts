import { Router, type IRouter } from "express";
import {
  ARTICULATION_SOURCE_NOTE,
  listInstitutions,
  searchArticulation,
} from "../data/articulation";

const router: IRouter = Router();

router.get("/articulation", (req, res) => {
  const institution = (req.query.institution as string | undefined)?.trim();
  if (!institution) {
    return res.status(400).json({ error: "institution is required" });
  }
  const courseCode = (req.query.courseCode as string | undefined)?.trim();
  const scuTarget = (req.query.scuTarget as string | undefined)?.trim();

  const matches = searchArticulation({ institution, courseCode, scuTarget });
  res.json({
    institution,
    matches,
    availableInstitutions: listInstitutions(),
    sourceNote: ARTICULATION_SOURCE_NOTE,
  });
});

export default router;
