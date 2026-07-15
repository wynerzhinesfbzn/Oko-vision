import { Router, type IRouter } from "express";
import healthRouter   from "./health";
import referralRouter from "./referral";
import rpcRouter      from "./rpc";
import jupiterRouter  from "./jupiter";
import feeRouter      from "./fee";
import scanRouter     from "./scan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referralRouter);
router.use(rpcRouter);
router.use(jupiterRouter);
router.use(feeRouter);
router.use(scanRouter);   // DexScreener proxy + price cache

export default router;
