import type { FullSummaryData } from '$lib/types';

export type TodayHistoryEntry = {
	videoId: string;
	title: string;
	keyTakeaway: string;
	timestamp: number;
};

type TodayHistoryMap = Record<string, TodayHistoryEntry[]>;

export const TODAY_HISTORY_STORAGE_KEY = 'yg:today-history';

const MAX_ENTRIES_PER_DAY = 30;
const MAX_DAYS_TO_KEEP = 7;

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function getTodayKey(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

function readHistoryMap(): TodayHistoryMap {
	if (!isBrowser) return {};
	try {
		const raw = window.localStorage.getItem(TODAY_HISTORY_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') {
			return parsed as TodayHistoryMap;
		}
	} catch (error) {
		console.warn('Failed to read today history from storage:', error);
	}
	return {};
}

function writeHistoryMap(map: TodayHistoryMap) {
	if (!isBrowser) return;
	try {
		window.localStorage.setItem(TODAY_HISTORY_STORAGE_KEY, JSON.stringify(map));
	} catch (error) {
		console.warn('Failed to persist today history to storage:', error);
	}
}

function pruneOldDays(map: TodayHistoryMap) {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - (MAX_DAYS_TO_KEEP - 1));
	const cutoffKey = getTodayKey(cutoffDate);
	for (const key of Object.keys(map)) {
		if (key < cutoffKey) {
			delete map[key];
		}
	}
}

export function addTodayHistoryEntry(summary: FullSummaryData | null | undefined) {
	if (!isBrowser || !summary?.videoId) return;
	if (summary.hasSubtitles === false) return;

	const map = readHistoryMap();
	const todayKey = getTodayKey();
	const existingForToday = map[todayKey] ?? [];

	const entry: TodayHistoryEntry = {
		videoId: summary.videoId,
		title: summary.title ?? '',
		keyTakeaway: summary.keyTakeaway ?? '',
		timestamp: Date.now()
	};

	const filtered = existingForToday.filter((item) => item.videoId !== entry.videoId);
	map[todayKey] = [entry, ...filtered].slice(0, MAX_ENTRIES_PER_DAY);

	pruneOldDays(map);
	writeHistoryMap(map);
}

export function getTodayHistoryEntries(): TodayHistoryEntry[] {
	if (!isBrowser) return [];
	try {
		const map = readHistoryMap();
		const todayKey = getTodayKey();
		return map[todayKey] ?? [];
	} catch (error) {
		console.warn('Failed to get today history entries:', error);
		return [];
	}
}

export function removeTodayHistoryEntry(videoId: string) {
	if (!isBrowser) return;
	const map = readHistoryMap();
	const todayKey = getTodayKey();
	const list = map[todayKey];
	if (!list) return;
	const next = list.filter((item) => item.videoId !== videoId);
	if (next.length === 0) {
		delete map[todayKey];
	} else {
		map[todayKey] = next;
	}
	writeHistoryMap(map);
}

export function clearTodayHistory() {
	if (!isBrowser) return;
	try {
		window.localStorage.removeItem(TODAY_HISTORY_STORAGE_KEY);
	} catch (error) {
		console.warn('Failed to clear today history:', error);
	}
}

