import { createElement } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Card } from "./Card";

export function Lane({ lane, cards, compactCards }) {
	return (
		<Droppable droppableId={String(lane.id)} type="CARD">
			{provided => (
				<div
					ref={provided.innerRef}
					{...provided.droppableProps}
					className="kbn-lane"
					style={{ width: lane.widthPx }}
				>
					<div className="kbn-lane-title">{(lane.title ?? "Lane") + " (" + cards.length + ")"}</div>
					<div className="kbn-lane-cards">
						{cards.map((card, index) => (
							<Card key={card.id} card={card} index={index} compact={compactCards} />
						))}
						{provided.placeholder}
					</div>
				</div>
			)}
		</Droppable>
	);
}


