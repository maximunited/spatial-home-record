"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProject } from "@/lib/projects";

export async function createProjectAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Project name is required");
  }
  const project = await createProject({ name });
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}
