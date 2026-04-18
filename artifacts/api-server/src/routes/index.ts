import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import coursesRouter from "./courses";
import plannerRouter from "./planner";
import gpaRouter from "./gpa";
import transferRouter from "./transfer";
import policiesRouter from "./policies";
import dashboardRouter from "./dashboard";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(coursesRouter);
router.use(plannerRouter);
router.use(gpaRouter);
router.use(transferRouter);
router.use(policiesRouter);
router.use(dashboardRouter);
router.use(openaiRouter);

export default router;
