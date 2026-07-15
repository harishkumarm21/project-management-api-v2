import { generateAccessToken, verifyAccessToken } from "../utils/jwt.js";

const token = generateAccessToken("123");

console.log(token);

console.log(
  verifyAccessToken(token)
);