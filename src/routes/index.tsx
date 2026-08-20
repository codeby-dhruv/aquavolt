import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const PrimalRun = lazy(() => import("@/components/PrimalRun"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Primal Run — Ocean Speedboat Endless Runner" },
      {
        name: "description",
        content:
          "Primal Run is a browser endless runner: skim the azure sea in a speedboat, dodging rocks, buoys and leaping fish across the Ocean Tropics.",
      },
      { property: "og:title", content: "Primal Run — Ocean Speedboat Endless Runner" },
      {
        property: "og:description",
        content:
          "Jump, duck and accelerate across the Ocean Tropics in this original 60 FPS browser speedboat runner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-black">
      <img src="/AQUAVOLT.png" alt="AQUAVOLT" className="w-[min(70vw,560px)] select-none" />
    </div>
  );
}

function Index() {
  return (
    <main>
      <h1 className="sr-only">Primal Run — ocean speedboat endless runner</h1>
      <ClientOnly fallback={<Loading />}>
        <Suspense fallback={<Loading />}>
          <PrimalRun />
        </Suspense>
      </ClientOnly>
    </main>
  );
}
