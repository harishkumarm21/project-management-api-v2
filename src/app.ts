import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { sendSuccess } from "./utils/api-response.js";

const app = express();

app.use(express.json());

app.get('/health',(_req, res)=>{
  // sendSuccess(res, 200, "Api is running")
  res.status(200).json(
    {
      success: true, 
      message: "Api is running"
    }
  )
})

app.use(notFound);

app.use(errorHandler);

export default app;