// ===============================
// src/animation/useFlyToTarget.ts
// ===============================
import { useContext } from "react";
import { FlyToTargetContext } from "./FlyToTargetProvider";

export function useFlyToTarget() {
  const ctx = useContext(FlyToTargetContext);
  if (!ctx) {
    throw new Error("useFlyToTarget must be used within FlyToTargetProvider");
  }
  return ctx;
}
