import React, { createElement, useCallback, useMemo, useState, useRef, useEffect } from "react";
import Big from "big.js";
import { Board } from "./components/Board";
import "./ui/KanbanDragAndDrop.css";
import { fractionalBetween } from "./utils/fractionalIndex";

export function KanbanDragAndDrop(props) {
  const lanesReady = props.lanes?.status === "available";
  const cardsReady = props.cards?.status === "available";
  if (!lanesReady || !cardsReady || !props.cardSortKeyAttr || !props.cardLaneRef) {
    return <div className="kbn-board">Loading…</div>;
  }

  // Lanes
  const lanes = useMemo(() => {
    const items = props.lanes?.items ?? [];
    const lanesWithSort = items.map((l, index) => {
      const raw = props.laneSortKeyAttr?.get?.(l)?.value;
      const sortKey =
        typeof raw === "number" ? raw :
        typeof raw === "string" ? parseFloat(raw) || 0 :
        raw && raw.toNumber ? raw.toNumber() : 0;
      return { id: String(l.id), index, sortKey, title: "Lane", mxObj: l };
    });
    lanesWithSort.sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0));
    return lanesWithSort.map(({ id, index, title, mxObj }) => ({ id, index, title, mxObj }));
  }, [props.lanes?.items, props.laneSortKeyAttr]);

  const laneIdSet = useMemo(() => new Set(lanes.map(l => l.id)), [lanes]);

  // Cards → grouped by lane (derived from datasource)
  const derivedCardsByLane = useMemo(() => {
    const out = {};
    const items = props.cards?.items ?? [];
    for (const c of items) {
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
      (out[laneId] ||= []).push({ id: String(c.id), sortKey, mxObj: c });
    }
    Object.keys(out).forEach(k => out[k].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0)));
    return out;
  }, [props.cards?.items, props.cardSortKeyAttr, props.cardLaneRef]);

  // UI state (optimistic)
  const [viewCardsByLane, setViewCardsByLane] = useState(derivedCardsByLane);

  // Subscriptions
  const pendingGuidRef = useRef(null);
  const moveSubRef = useRef(null);
  const entitySubRef = useRef(null);

  // Mirror server when idle
  useEffect(() => {
    if (!pendingGuidRef.current) setViewCardsByLane(derivedCardsByLane);
  }, [derivedCardsByLane]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (moveSubRef.current) window.mx.data.unsubscribe(moveSubRef.current);
      if (entitySubRef.current) window.mx.data.unsubscribe(entitySubRef.current);
    };
  }, []);

  // Upsert/remove helpers
  const upsertCardIntoState = useCallback(
    (guid, laneId, sortKey, mxObj) => {
      const laneKey = String(laneId);
      if (!laneKey || !laneIdSet.has(laneKey)) return;

      setViewCardsByLane(prev => {
        const next = {};
        for (const [k, v] of Object.entries(prev)) next[k] = v.slice();

        // remove if exists (move/update)
        for (const k of Object.keys(next)) {
          const idx = next[k].findIndex(c => c.id === String(guid));
          if (idx >= 0) next[k].splice(idx, 1);
        }

        // ensure lane array exists, then insert sorted
        const list = (next[laneKey] ||= []);
        const entry = { id: String(guid), sortKey, mxObj };
        let i = list.findIndex(c => (c.sortKey ?? 0) > (sortKey ?? 0));
        if (i === -1) i = list.length;
        list.splice(i, 0, entry);

        return next;
      });
    },
    [laneIdSet]
  );

  const removeCardFromState = useCallback(guid => {
    setViewCardsByLane(prev => {
      const next = {};
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        const arr = v.slice();
        const idx = arr.findIndex(c => c.id === String(guid));
        if (idx >= 0) { arr.splice(idx, 1); changed = true; }
        next[k] = arr;
      }
      return changed ? next : prev;
    });
  }, []);

  // Entity subscription: create/update/delete
  useEffect(() => {
    const entityName = props.cards?.items?.[0]?.getEntity?.();
    if (!entityName) return;

    if (entitySubRef.current) {
      window.mx.data.unsubscribe(entitySubRef.current);
      entitySubRef.current = null;
    }

    entitySubRef.current = window.mx.data.subscribe({
      entity: entityName,
      callback: changedGuid => {
        // If a guid is provided → upsert/remove just that one
        if (changedGuid) {
          if (pendingGuidRef.current && String(changedGuid) === String(pendingGuidRef.current)) {
            return; // let the per-object subscription finalize the move
          }
          window.mx.data.get({
            guid: String(changedGuid),
            callback: obj => {
              if (!obj) { removeCardFromState(changedGuid); return; }
              const laneId = obj.get(props.cardLaneRef.id);
              const sortRaw = obj.get(props.cardSortKeyAttr.id);
              const sortKey =
                typeof sortRaw === "number" ? sortRaw :
                typeof sortRaw === "string" ? parseFloat(sortRaw) || 0 :
                sortRaw && sortRaw.toNumber ? sortRaw.toNumber() : 0;
              upsertCardIntoState(changedGuid, laneId, sortKey, obj);
            }
          });
          return;
        }

        // Fallback: some entity-level callbacks don't pass a guid.
        // Trigger a datasource reload so derivedCardsByLane updates,
        // which will refresh empty lanes as well.
        props.cards?.reload?.();
      }
    });

    return () => {
      if (entitySubRef.current) {
        window.mx.data.unsubscribe(entitySubRef.current);
        entitySubRef.current = null;
      }
    };
  }, [props.cards?.items, props.cardLaneRef, props.cardSortKeyAttr, upsertCardIntoState, removeCardFromState]);

  // Drag & drop persistence
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
    if (moveSubRef.current) {
      window.mx.data.unsubscribe(moveSubRef.current);
      moveSubRef.current = null;
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

      setViewCardsByLane(prev =>
        applyLocalMove(prev, fromLane, toLane, fromIdx, toIdx, String(draggableId), newKeyNum)
      );
      pendingGuidRef.current = String(draggableId);

      const cardItem = (props.cards?.items ?? []).find(i => String(i.id) === String(draggableId));
      if (!cardItem) return;

      const laneObj = (props.lanes?.items ?? []).find(l => String(l.id) === toLane);
      const laneGuidValue = props.laneGuidAttr?.get?.(laneObj)?.value;
      props.moveTargetLaneGuid.setValue(laneGuidValue);
      props.moveNewSortKey.setValue(newKeyBig);
      props.onPersist?.get?.(cardItem)?.execute?.();

      if (moveSubRef.current) window.mx.data.unsubscribe(moveSubRef.current);
      moveSubRef.current = window.mx.data.subscribe({
        guid: String(draggableId),
        callback: () => {
          window.mx.data.get({
            guid: String(draggableId),
            callback: obj => {
              if (!obj) return;
              const laneGuid = obj.get(props.cardLaneRef.id);
              const sortKeyRaw = obj.get(props.cardSortKeyAttr.id);
              let sortKey;
              if (typeof sortKeyRaw === "number") sortKey = sortKeyRaw;
              else if (typeof sortKeyRaw === "string") sortKey = parseFloat(sortKeyRaw) || 0;
              else if (sortKeyRaw && sortKeyRaw.toNumber) sortKey = sortKeyRaw.toNumber();
              else sortKey = 0;

              if (laneGuid === toLane && Math.abs(sortKey - newKeyNum) < 1e-6) {
                clearPending();
              }
            }
          });
        }
      });
    },
    [
      viewCardsByLane,
      props.cards?.items,
      props.lanes?.items,
      props.laneGuidAttr,
      props.moveTargetLaneGuid,
      props.moveNewSortKey,
      props.onPersist,
      props.cardLaneRef,
      props.cardSortKeyAttr
    ]
  );

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
