import { createElement } from "react";
import { Draggable } from "@hello-pangea/dnd";

export function Card({ card, index }) {
	return (
		<Draggable draggableId={String(card.id)} index={index}>
			{(provided, snapshot) => (
				<div
					ref={provided.innerRef}
					{...provided.draggableProps}
					{...provided.dragHandleProps}
					className={
						"kbn-card" + (snapshot.isDragging ? " kbn-card--dragging" : "")
					}
				>
					{card.title ?? String(card.id)}
				</div>
			)}
		</Draggable>
	);
}


