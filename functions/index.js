const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

setGlobalOptions({ maxInstances: 10 });

exports.getDailyWord = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  logger.info("getDailyWord called", { uid: request.auth.uid });

  return {
    word: "HELLO",
    date: new Date().toISOString().slice(0, 10),
  };
});
