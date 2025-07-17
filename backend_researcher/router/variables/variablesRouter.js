import { supabase } from "../../supabase/supabase";
import express from "express";

const router = express.Router();

router.post("/variable/create/:userId", async (req, res) => {
  const { userId } = req.params;
  const { variableName, variableValue } = req.body;
  try {
    const { error: insertionError } = await supabase
      .from("Variables")
      .insert({ name: variableName, value: variableValue, user_id: userId });

    if (insertionError) {
      return res.status(400).json({ message: "Insertion Error" });
    }

    return res.status(200).json({ message: "Successfully Created" });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/variable/delete/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { error: deletionError } = await supabase
      .from("Variables")
      .eq("id", id)
      .delete();
    if (deletionError) {
      return res.status(400).json({ message: "Failed to Delete" });
    }

    return res.status(201).json({ message: "Successfully Deleted" });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.put("/variable/update/:id", async (req, res) => {
  const { id } = req.params;
  const { variableName, variableValue } = req.body;
  try {
    const { error: updateError } = await supabase
      .from("Variables")
      .upsert({ name: variableName, value: variableValue })
      .eq("id", id);

    if (updateError) {
      return res.status(400).json({ message: "Failed to Delete" });
    }

    return res.status(201).json({ message: "Successfully Deleted" });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/variable/get-all", async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: variableData, error: insertionError } = await supabase
      .from("Variables")
      .select("*")
      .eq("user_id", userId);

    if (insertionError) {
      return res.status(400).json({ message: "Insertion Error" });
    }

    return res.status(200).json({ data: variableData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
