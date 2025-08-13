import { createElement, useCallback } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { Lane } from "./Lane";

export function Board({ lanes, cardsByLane, onCardMove }) {
	const handleDragEnd = useCallback(
		result => {
			const { destination } = result;
			if (!destination) return;
			onCardMove(result);
		},
		[onCardMove]
	);

	return (
		<DragDropContext onDragEnd={handleDragEnd}>
			<div className="kbn-board">
				{lanes.map(lane => (
					<Lane key={lane.id} lane={lane} cards={cardsByLane[lane.id] || []} />
				))}
			</div>
		</DragDropContext>
	);
}


