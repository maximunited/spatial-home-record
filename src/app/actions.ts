"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProject } from "@/lib/projects";

export async function createProjectAction(formData: FormData) {
  if (!process.env.DATABASE_URL) {
    redirect("/?error=database");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/?error=name");
  }

  try {
    const project = await createProject({ name });
    revalidatePath("/");
    redirect(`/projects/${project.id}`);
  } catch {
    redirect("/?error=create");
  }
}
