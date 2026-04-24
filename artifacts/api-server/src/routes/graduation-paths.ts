import { Router, type IRouter } from "express";
import { getGraduationPath, type PathType } from "../data/graduation-paths";

const router: IRouter = Router();

router.get("/graduation-paths/:type", (req, res) => {
  const type = req.params.type;
  if (type !== "three_year" && type !== "four_year") {
    return res
      .status(400)
      .json({ error: "type must be 'three_year' or 'four_year'" });
  }
  const major = (req.query.major as string | undefined) ?? "CSE";
  const path = getGraduationPath(type as PathType, major);
  res.json(path);
});

export default router;
