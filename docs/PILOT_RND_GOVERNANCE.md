# Pilot R&D data governance

_2026-10-16. This note records a boundary, not a feature proposal._

CampusVal does not collect, label, train on, or infer from private student plans, APRs, checksheets, or completed degrees for generated-plan recommendations. The pilot uses published Bulletin and department sources plus student-controlled planning records only.

Future recommendation research based on verified completed plans must not begin until SCU has made and documented all of the following decisions:

- a purpose limitation and academic-owner approval;
- informed consent or another documented lawful basis for every included record;
- independent verification that a completion record is accurate and appropriately scoped;
- de-identification, minimum necessary fields, retention/deletion rules, access controls, and audit logging;
- bias, unit-mismatch, and academic-policy review; and
- a separate product decision about how recommendations are labelled, reviewed, and challenged by students and advisors.

Until then, `ENABLE_GENERATED_PLAN_RND` only protects deterministic internal sequence experiments derived from published requirements. It does not enable data collection or model training.
