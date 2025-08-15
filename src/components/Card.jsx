import React, { createElement } from "react";
import { Draggable } from "@hello-pangea/dnd";

export function Card({ card, index, compact, cardContent }) {
  const body = (
    card.mxObj && cardContent?.get ? cardContent.get(card.mxObj) :
    (cardContent /* ReactNode fallback */ ?? card.title ?? String(card.id))
  );

  return (
    <Draggable draggableId={String(card.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={
            "kbn-card" +
            (compact ? " kbn-card--compact" : "") +
            (snapshot.isDragging ? " kbn-card--dragging" : "")
          }
        >
          {body}
        </div>
      )}
    </Draggable>
  );
}
