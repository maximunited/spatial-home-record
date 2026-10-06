"use client";

import { useId, useState } from "react";
import type { PhasePhoto } from "@/lib/wall-photo-compare";

export function WallPhotoCompare({
  construction,
  current,
}: {
  construction: PhasePhoto | null;
  current: PhasePhoto | null;
}) {
  const [mode, setMode] = useState<"side" | "slider">("side");
  const [slider, setSlider] = useState(50);
  const sliderId = useId();

  if (!construction && !current) return null;

  return (
    <section className="mb-4 rounded border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">
          Construction vs current
        </h3>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            className={`rounded px-2 py-1 ${mode === "side" ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-700"}`}
            onClick={() => setMode("side")}
          >
            Side by side
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 ${mode === "slider" ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-700"}`}
            onClick={() => setMode("slider")}
            disabled={!construction?.publicUrl || !current?.publicUrl}
            title={
              !construction?.publicUrl || !current?.publicUrl
                ? "Need both photos with images for slider"
                : undefined
            }
          >
            Slider
          </button>
        </div>
      </div>

      {mode === "side" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <PhotoPanel label="Construction" photo={construction} />
          <PhotoPanel label="Current" photo={current} />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative aspect-[8/5] overflow-hidden rounded bg-zinc-100">
            {current?.publicUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.publicUrl}
                alt={current.summary ?? "Current"}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
            {construction?.publicUrl ? (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${slider}%` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={construction.publicUrl}
                  alt={construction.summary ?? "Construction"}
                  className="h-full max-w-none object-cover"
                  style={{ width: `${10000 / Math.max(slider, 1)}%` }}
                />
              </div>
            ) : null}
            <div
              className="absolute inset-y-0 w-0.5 bg-white shadow"
              style={{ left: `${slider}%` }}
              aria-hidden
            />
          </div>
          <label htmlFor={sliderId} className="block text-xs text-zinc-500">
            Drag to compare
          </label>
          <input
            id={sliderId}
            type="range"
            min={5}
            max={95}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}
    </section>
  );
}

function PhotoPanel({
  label,
  photo,
}: {
  label: string;
  photo: PhasePhoto | null;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      {photo?.publicUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.publicUrl}
          alt={photo.summary ?? label}
          className="aspect-[8/5] w-full rounded border border-zinc-200 object-cover"
        />
      ) : (
        <div className="flex aspect-[8/5] items-center justify-center rounded border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
          {photo ? photo.summary ?? "No image file" : "Not linked yet"}
        </div>
      )}
      {photo?.summary ? (
        <p className="mt-1 text-xs text-zinc-600">{photo.summary}</p>
      ) : null}
    </div>
  );
}
