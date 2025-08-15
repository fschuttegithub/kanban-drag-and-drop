import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./components/Board";
import Big from "big.js";
import "./ui/KanbanDragAndDrop.css";


export function KanbanDragAndDrop(props) {
  const lanesReady = props.lanes?.status === "available";
  const cardsReady = props.cards?.status === "available";
  if (!lanesReady || !cardsReady) {
    return <div className="kbn-board">Loading…</div>;
  }
  // Ensure all required props are provided
  const missingProps = [];
  if (!props.cardSortKeyAttr) missingProps.push("cardSortKeyAttr");
  if (!props.cardLaneRef) missingProps.push("cardLaneRef");
  if (!props.laneGuidAttr) missingProps.push("laneGuidAttr");
  if (!props.moveTargetLaneGuid) missingProps.push("moveTargetLaneGuid");
  if (!props.moveNewSortKey) missingProps.push("moveNewSortKey");
  if (!props.onPersist) missingProps.push("onPersist");
  if (missingProps.length > 0) {
    console.error(`KanbanDragAndDrop: Missing required properties: ${missingProps.join(", ")}`);
    return <div className="kbn-board">Configuration incomplete</div>;
  }

  // ---------- helpers ----------
  const toNumber = v => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    if (v && typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
    if (v && typeof v === "object" && typeof v.toString === "function") {
      const n = parseFloat(v.toString());
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const getLaneIdFromCard = c => {
    const laneRef = props.cardLaneRef.get(c);
    // Try canonical id first, then .value.id, then .value (if holds id), then string/number
    if (laneRef && (typeof laneRef.id === "string" || typeof laneRef.id === "number")) return String(laneRef.id);
    const v = laneRef?.value;
    if (v && typeof v === "object" && "id" in v) return String(v.id);
    if (typeof v === "string" || typeof v === "number") return String(v);
    return null;
  };

  // ---------- lanes ----------
  const lanes = useMemo(() => {
    const items = props.lanes?.items ?? [];
    const arr = items.map((l, index) => {
      const raw = props.laneSortKeyAttr?.get?.(l)?.value;
      const sortKey = toNumber(raw);
      return { id: String(l.id), index, sortKey, mxObj: l };
    });
    arr.sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0) || String(a.id).localeCompare(String(b.id)));
    return arr.map(({ id, index, sortKey, mxObj }) => ({ id, index, sortKey, mxObj }));
  }, [props.lanes?.items, props.laneSortKeyAttr]);

  const laneIdSet = useMemo(() => new Set(lanes.map(l => l.id)), [lanes]);

  // ---------- server-derived cards by lane (normalize to 0..n-1 positions) ----------
  const derivedCardsByLane = useMemo(() => {
    const bucket = {};
    const items = props.cards?.items ?? [];
    for (const c of items) {
      const laneId = getLaneIdFromCard(c);
      if (!laneId) continue;
      const raw = props.cardSortKeyAttr.get(c)?.value;
      const sortKey = toNumber(raw);
      (bucket[laneId] ||= []).push({ id: String(c.id), sortRaw: sortKey, mxObj: c });
    }
    // sort by raw then reindex to 0..n-1 so visual order is integer-based
    const out = {};
    for (const [k, arr] of Object.entries(bucket)) {
      arr.sort((a, b) => (a.sortRaw ?? 0) - (b.sortRaw ?? 0) || String(a.id).localeCompare(String(b.id)));
      out[k] = arr.map((x, idx) => ({ id: x.id, sortKey: idx, mxObj: x.mxObj }));
    }
    return out;
  }, [props.cards?.items, props.cardSortKeyAttr, props.cardLaneRef]);

  // ---------- optimistic view state & pending overlay ----------
  const [viewCardsByLane, setViewCardsByLane] = useState(derivedCardsByLane);

  // Map<cardId, { toLane: string, sortKey: number }>
  const pendingMovesRef = useRef(new Map());

  // Rebuild the view when server data changes.
  useEffect(() => {
    // First, clear any pending entries that the server has already applied.
    if (pendingMovesRef.current.size > 0) {
      const items = props.cards?.items ?? [];
      const byId = new Map(items.map(c => [String(c.id), c]));
      for (const [cardId, { toLane, sortKey }] of Array.from(pendingMovesRef.current.entries())) {
        const c = byId.get(cardId);
        if (!c) continue;
        const laneId = getLaneIdFromCard(c);
        const currentRaw = toNumber(props.cardSortKeyAttr.get(c)?.value);
        // server raw might not be normalized; treat equality if lane matches AND raw equals target index
        if (laneId === toLane && currentRaw === sortKey) {
          pendingMovesRef.current.delete(cardId);
        }
      }
    }

    // If nothing pending, mirror server; otherwise overlay pending moves on top.
    if (pendingMovesRef.current.size === 0) {
      setViewCardsByLane(derivedCardsByLane);
    } else {
      setViewCardsByLane(applyPendingOverlay(derivedCardsByLane, pendingMovesRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedCardsByLane, props.cards?.items]);

  const applyPendingOverlay = (base, pendingMap) => {
    // clone base shallowly
    const out = {};
    for (const [k, v] of Object.entries(base)) out[k] = v.slice();

    // Build server byId map to retrieve mxObj reliably
    const allItems = props.cards?.items ?? [];
    const byId = new Map(allItems.map(c => [String(c.id), c]));

    // Remove card wherever it currently sits
    const removeCardFromAll = cardId => {
      for (const arr of Object.values(out)) {
        const idx = arr.findIndex(x => x.id === cardId);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };

    for (const [cardId, { toLane, sortKey }] of pendingMap.entries()) {
      removeCardFromAll(cardId);
      if (!laneIdSet.has(toLane)) continue;

      const dst = out[toLane] || (out[toLane] = []);

      // Insert at desired index (sortKey is the target index)
      const insertIdx = Math.min(Math.max(sortKey, 0), dst.length);
      const mxObj = byId.get(cardId); // use server object; safe for cardContent.get(...)

      dst.splice(insertIdx, 0, { id: cardId, sortKey: insertIdx, mxObj });

      // Reindex to keep sortKey == visual index
      for (let i = 0; i < dst.length; i++) dst[i].sortKey = i;
    }
    return out;
  };

  // ---------- helpers for local moves ----------
  const applyLocalMove = (state, fromLane, toLane, fromIdx, toIdx, cardId) => {
    const next = {};
    for (const [k, v] of Object.entries(state)) next[k] = v.slice();
    const src = next[fromLane] ?? [];
    const dst = fromLane === toLane ? src : (next[toLane] ?? (next[toLane] = []));

    // Remove moving item
    let moving;
    if (fromLane === toLane) moving = dst.splice(fromIdx, 1)[0];
    else moving = src.splice(fromIdx, 1)[0];
    if (!moving) return state;

    // Clamp destination index and insert
    const clamped = Math.min(Math.max(toIdx, 0), dst.length);
    const updated = { ...moving, id: cardId };
    dst.splice(clamped, 0, updated);

    // Reindex both lanes so sortKey equals visual index
    for (let i = 0; i < src.length; i++) src[i].sortKey = i;
    for (let i = 0; i < dst.length; i++) dst[i].sortKey = i;

    next[fromLane] = src;
    next[toLane] = dst;
    return next;
  };

  // ---------- drag & drop persistence ----------
  const onCardMove = useCallback(
    result => {
      const { draggableId, source, destination } = result ?? {};
      if (!destination || !draggableId) return;

      const fromLane = String(source.droppableId);
      const toLane = String(destination.droppableId);
      const fromIdx = source.index;
      const toIdx = destination.index;

      if (!laneIdSet.has(fromLane) || !laneIdSet.has(toLane)) return;

      // NewSortKey is the visual target index (0-based)
      const newIndex = toIdx;

      // Optimistic local move
      setViewCardsByLane(prev => applyLocalMove(prev, fromLane, toLane, fromIdx, newIndex, String(draggableId)));

      // Record as pending so re-renders won't snap back while microflow runs
      pendingMovesRef.current.set(String(draggableId), { toLane, sortKey: newIndex });

      // Prepare and run persist action
      const cardItem = (props.cards?.items ?? []).find(i => String(i.id) === String(draggableId));
      if (!cardItem) return;

      const laneObj = (props.lanes?.items ?? []).find(l => String(l.id) === toLane);
      const laneGuidValue = props.laneGuidAttr?.get?.(laneObj)?.value;

      props.moveTargetLaneGuid?.setValue?.(laneGuidValue);
      props.moveNewSortKey?.setValue?.(new Big(newIndex)); // integer 0..n-1
      const persistAction = props.onPersist?.get?.(cardItem);
      if (persistAction?.canExecute) {
        persistAction.execute();
      }

      // Refresh datasource; overlay prevents visual snap-back.
      props.cards?.reload?.();
    },
    [
      laneIdSet,
      props.cards?.items,
      props.lanes?.items,
      props.laneGuidAttr,
      props.moveTargetLaneGuid,
      props.moveNewSortKey,
      props.onPersist
    ]
  );

  // Render Board with provided templates and layout props
  return (
    <Board
      lanes={lanes}
      cardsByLane={viewCardsByLane}
      onCardMove={onCardMove}
      laneWidth={
        typeof props.laneWidth === "string"
          ? props.laneWidth
          : typeof props.laneWidth === "number"
          ? `${props.laneWidth}px`
          : "500px"
      }
      compactCards={props.compactCards ?? false}
      laneContent={props.laneContent}
      cardContent={props.cardContent}
      enableLaneBottomSheet={props.enableLaneBottomSheet}
      laneBottomSheet={props.laneBottomSheet}
      enableLaneEmptySheet={props.enableLaneEmptySheet}
      laneEmptySheet={props.laneEmptySheet}
    />
  );
}
