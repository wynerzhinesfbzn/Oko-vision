import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referralRouter from "./referral";
import rpcRouter from "./rpc";
import jupiterRouter from "./jupiter";
import feeRouter from "./fee";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referralRouter);
router.use(rpcRouter);
router.use(jupiterRouter);
router.use(feeRouter);

export default router;
