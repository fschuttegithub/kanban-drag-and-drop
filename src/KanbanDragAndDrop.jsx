import { createElement, useCallback, useMemo, useState, useRef, useEffect } from "react";
import Big from "big.js";
import { Board } from "./components/Board";
import "./ui/KanbanDragAndDrop.css";
import { fractionalBetween } from "./utils/fractionalIndex";

export function KanbanDragAndDrop(props) {
  const lanesReady = props.lanes?.status === "available";
  const cardsReady = props.cards?.status === "available";
  if (!lanesReady || !cardsReady || !props.cardTitleAttr || !props.cardSortKeyAttr || !props.cardLaneRef) {
    return <div className="kbn-board">Loading…</div>;
  }

  const lanes = useMemo(() => {
    const items = props.lanes?.items ?? [];
    return items.map((l, index) => ({ id: String(l.id), index }));
  }, [props.lanes?.items]);

  const derivedCardsByLane = useMemo(() => {
    const out = {};
    const items = props.cards?.items ?? [];
    for (const c of items) {
      const title = props.cardTitleAttr.get(c)?.value ?? "";
      const raw = props.cardSortKeyAttr.get(c)?.value;
      const sortKey =
        typeof raw === "number" ? raw :
        typeof raw === "string" ? parseFloat(raw) || 0 :
        raw && raw.toNumber ? raw.toNumber() : 0;
      const laneRef = props.cardLaneRef.get(c);
      const v = laneRef?.value;
      const laneId =
        typeof laneRef?.id === "string" || typeof laneRef?.id === "number" ? String(laneRef.id) :
        v && typeof v === "object" && "id" in v ? String(v.id) :
        typeof v === "string" || typeof v === "number" ? String(v) : null;
      if (!laneId) continue;
      (out[laneId] ||= []).push({ id: String(c.id), title, sortKey });
    }
    Object.keys(out).forEach(k => out[k].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0)));
    return out;
  }, [props.cards?.items, props.cardTitleAttr, props.cardSortKeyAttr, props.cardLaneRef]);

  const [viewCardsByLane, setViewCardsByLane] = useState(derivedCardsByLane);
  const pendingGuidRef = useRef(null);
  const subHandleRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!pendingGuidRef.current) setViewCardsByLane(derivedCardsByLane);
  }, [derivedCardsByLane]);

  useEffect(() => {
    return () => {
      if (subHandleRef.current) window.mx.data.unsubscribe(subHandleRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const applyLocalMove = (state, fromLane, toLane, fromIdx, toIdx, cardId, newKeyNum) => {
    const next = {};
    for (const [k, v] of Object.entries(state)) next[k] = v.slice();
    const src = next[fromLane] ?? [];
    const dst = fromLane === toLane ? src : (next[toLane] ?? []);
    let moving;
    if (fromLane === toLane) moving = dst.splice(fromIdx, 1)[0];
    else moving = src.splice(fromIdx, 1)[0];
    if (!moving) return state;
    dst.splice(toIdx, 0, { ...moving, id: cardId, sortKey: newKeyNum });
    next[fromLane] = src;
    next[toLane] = dst;
    return next;
  };

  const clearPending = () => {
    pendingGuidRef.current = null;
    if (subHandleRef.current) {
      window.mx.data.unsubscribe(subHandleRef.current);
      subHandleRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setViewCardsByLane(derivedCardsByLane);
  };

  const onCardMove = useCallback(
    result => {
      const { draggableId, source, destination } = result ?? {};
      if (!destination || !draggableId) return;

      const fromLane = String(source.droppableId);
      const toLane = String(destination.droppableId);
      const fromIdx = source.index;
      const toIdx = destination.index;

      const dst = (viewCardsByLane[toLane] ?? []).map(x => ({ ...x }));
      const src = fromLane === toLane ? dst : (viewCardsByLane[fromLane] ?? []).map(x => ({ ...x }));

      let moving;
      if (fromLane === toLane) moving = dst[fromIdx];
      else moving = src[fromIdx];
      if (!moving) return;

      const left = toIdx - 1 >= 0 ? dst[toIdx - 1]?.sortKey ?? null : null;
      const right = toIdx + 1 < dst.length ? dst[toIdx + 1]?.sortKey ?? null : null;

      const between = fractionalBetween(left, right);
      const newKeyBig = between && between.toNumber ? between : new Big(between ?? 0);
      const newKeyNum = newKeyBig.toNumber();

      setViewCardsByLane(prev => applyLocalMove(prev, fromLane, toLane, fromIdx, toIdx, String(draggableId), newKeyNum));
      pendingGuidRef.current = String(draggableId);

      const cardItem = (props.cards?.items ?? []).find(i => String(i.id) === String(draggableId));
      if (!cardItem) return;

      props.moveTargetLaneGuid.setValue(toLane);
      props.moveNewSortKey.setValue(newKeyBig);
      props.onPersist?.get?.(cardItem)?.execute?.();

      if (subHandleRef.current) window.mx.data.unsubscribe(subHandleRef.current);
      subHandleRef.current = window.mx.data.subscribe({
        guid: String(draggableId),
        callback: () => clearPending()
      });

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => clearPending(), 3000);
    },
    [viewCardsByLane, props.cards?.items, props.moveTargetLaneGuid, props.moveNewSortKey, props.onPersist]
  );

  return (
    <Board
      lanes={lanes}
      cardsByLane={viewCardsByLane}
      onCardMove={onCardMove}
      laneWidth={props.laneWidth ?? 300}
      compactCards={props.compactCards ?? false}
    />
  );
}
