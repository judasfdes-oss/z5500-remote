import { createFileRoute } from "@tanstack/react-router";
import { ControlDeck } from "@/components/deck/control-deck";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ControlDeck />;
}
