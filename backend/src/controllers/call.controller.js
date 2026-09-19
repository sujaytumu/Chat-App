import CallLog from "../models/callLog.model.js";

export const getCallHistory = async (req, res) => {
  try {
    const myId = req.user._id;
    const calls = await CallLog.find({ $or: [{ callerId: myId }, { calleeId: myId }] })
      .populate("callerId", "fullName profilePic")
      .populate("calleeId", "fullName profilePic")
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json(calls);
  } catch (error) {
    console.log("Error in getCallHistory controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
