import React, { createElement } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Card } from "./Card";

export function Lane({
  lane,
  cards,
  compactCards,
  laneContent,
  cardContent,
  enableLaneBottomSheet,
  laneBottomSheet,
  enableLaneEmptySheet,
  laneEmptySheet
}) {
  const header =
    laneContent?.get?.(lane.mxObj) ??
    laneContent /* if runtime gives a ReactNode */ ??
    `${lane.title ?? "Lane"} (${cards.length})`;

  // lane.widthCss may be a string like '500px' or a number; normalize
  const laneWidthStyle =
    typeof lane.widthCss === "string"
      ? lane.widthCss
      : typeof lane.widthCss === "number"
      ? `${lane.widthCss}px`
      : "500px";

  // Apply as a CSS custom property so the flex basis in CSS (var(--lane-width)) is used
  return (
    <div className="kbn-lane" style={{ ['--lane-width']: laneWidthStyle }}>
      <div className="kbn-lane-title">{header}</div>

      {/* Droppable CARD list */}
      <Droppable droppableId={String(lane.id)} type="CARD">
        {provided => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="kbn-lane-cards">
            {cards.length === 0 && enableLaneEmptySheet ? (
              laneEmptySheet?.get?.(lane.mxObj) ?? laneEmptySheet
            ) : (
              cards.map((card, index) => (
                <Card key={card.id} card={card} index={index} compact={compactCards} cardContent={cardContent} />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Optional bottom sheet OUTSIDE the droppable (no nested scroll parent) */}
      {enableLaneBottomSheet ? (
        <div className={"kbn-lane-bottom" + (cards.length > 0 ? " kbn-lane-bottom--with-cards" : "")}>
          {laneBottomSheet?.get?.(lane.mxObj) ?? laneBottomSheet /* React node fallback */}
        </div>
      ) : null}
    </div>
  );
}
