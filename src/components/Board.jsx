import React, { createElement, useCallback } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { Lane } from "./Lane";

export function Board({
    lanes,
    cardsByLane,
    onCardMove,
    laneWidth,
    compactCards,
    laneContent,
    cardContent,
    enableLaneBottomSheet,
    laneBottomSheet
    ,enableLaneEmptySheet,
    laneEmptySheet
}) {
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
                    <Lane
                        key={lane.id}
                        lane={{ ...lane, widthCss: laneWidth }}
                        cards={cardsByLane[lane.id] || []}
                        compactCards={compactCards}
                        laneContent={laneContent}
                        cardContent={cardContent}
                        /* NEW: bottom sheet props */
                        enableLaneBottomSheet={enableLaneBottomSheet}
                        laneBottomSheet={laneBottomSheet}
                        enableLaneEmptySheet={enableLaneEmptySheet}
                        laneEmptySheet={laneEmptySheet}
                    />
                ))}
            </div>
        </DragDropContext>
    );
}
