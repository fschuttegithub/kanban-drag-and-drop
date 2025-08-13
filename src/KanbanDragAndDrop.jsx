import { createElement, useMemo } from "react";
import { Board } from "./components/Board";
import "./ui/KanbanDragAndDrop.css";

export function KanbanDragAndDrop(props) {
	// Step 1: Structure only — data mapping will be added in the next step.
	const lanes = useMemo(() => [], []);
	const cardsByLane = useMemo(() => ({}), []);

	return <Board lanes={lanes} cardsByLane={cardsByLane} onCardMove={() => {}} />;
}
