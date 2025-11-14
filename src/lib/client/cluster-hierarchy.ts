/**
 * Client-side caching and management for cluster hierarchy data
 */

import type { ClusterHierarchy, ClusterTree } from '$lib/types';

const CACHE_KEY = 'ytgist_cluster_hierarchy';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedHierarchyData {
	hierarchyData: ClusterHierarchy | null;
	treeData: ClusterTree | null;
	timestamp: number;
	configHash: string;
}

/**
 * Generate a hash from clustering configuration to invalidate cache when config changes
 */
function getConfigHash(): string {
	// In the future, this could include min_cluster_size, min_samples, etc.
	// For now, just use a version string
	return 'v1';
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(cached: CachedHierarchyData | null): boolean {
	if (!cached) return false;
	
	const now = Date.now();
	const isNotExpired = now - cached.timestamp < CACHE_EXPIRY_MS;
	const isConfigSame = cached.configHash === getConfigHash();
	
	return isNotExpired && isConfigSame;
}

/**
 * Get cached hierarchy data from localStorage
 */
export function getCachedHierarchy(): ClusterHierarchy | null {
	if (typeof window === 'undefined') return null;
	
	try {
		const cachedStr = localStorage.getItem(CACHE_KEY);
		if (!cachedStr) return null;
		
		const cached: CachedHierarchyData = JSON.parse(cachedStr);
		
		if (isCacheValid(cached)) {
			console.log('[cluster-hierarchy] Using cached hierarchy data');
			return cached.hierarchyData;
		} else {
			console.log('[cluster-hierarchy] Cache expired or invalid, clearing');
			localStorage.removeItem(CACHE_KEY);
			return null;
		}
	} catch (error) {
		console.error('[cluster-hierarchy] Error reading cache:', error);
		localStorage.removeItem(CACHE_KEY);
		return null;
	}
}

/**
 * Save hierarchy data to localStorage
 */
export function cacheHierarchy(hierarchyData: ClusterHierarchy | null, treeData: ClusterTree | null = null): void {
	if (typeof window === 'undefined') return;
	
	try {
		const cached: CachedHierarchyData = {
			hierarchyData,
			treeData,
			timestamp: Date.now(),
			configHash: getConfigHash()
		};
		
		localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
		console.log('[cluster-hierarchy] Hierarchy data cached successfully');
	} catch (error) {
		console.error('[cluster-hierarchy] Error caching hierarchy:', error);
		// If localStorage is full or unavailable, silently fail
	}
}

/**
 * Clear cached hierarchy data
 */
export function clearHierarchyCache(): void {
	if (typeof window === 'undefined') return;
	
	try {
		localStorage.removeItem(CACHE_KEY);
		console.log('[cluster-hierarchy] Hierarchy cache cleared');
	} catch (error) {
		console.error('[cluster-hierarchy] Error clearing cache:', error);
	}
}

/**
 * Get cached tree data from localStorage
 */
export function getCachedTree(): ClusterTree | null {
	if (typeof window === 'undefined') return null;
	
	try {
		const cachedStr = localStorage.getItem(CACHE_KEY);
		if (!cachedStr) return null;
		
		const cached: CachedHierarchyData = JSON.parse(cachedStr);
		
		if (isCacheValid(cached)) {
			console.log('[cluster-hierarchy] Using cached tree data');
			return cached.treeData;
		} else {
			console.log('[cluster-hierarchy] Cache expired or invalid, clearing');
			localStorage.removeItem(CACHE_KEY);
			return null;
		}
	} catch (error) {
		console.error('[cluster-hierarchy] Error reading tree cache:', error);
		localStorage.removeItem(CACHE_KEY);
		return null;
	}
}

/**
 * Fetch hierarchy data from API and cache it
 */
export async function fetchAndCacheHierarchy(): Promise<ClusterHierarchy | null> {
	try {
		// First check cache
		const cached = getCachedHierarchy();
		if (cached) {
			return cached;
		}
		
		// Generate nonce
		const nonceResponse = await fetch('/api/generate-nonce');
		if (!nonceResponse.ok) {
			throw new Error('Failed to generate nonce');
		}
		const { nonce } = await nonceResponse.json();
		
		// Fetch cluster data with hierarchy
		const response = await fetch('/api/cluster-summaries', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				nonce,
				clearExisting: false // Don't clear existing clusters, just get hierarchy
			})
		});
		
		if (!response.ok) {
			throw new Error('Failed to fetch hierarchy data');
		}
		
		const result = await response.json();
		const hierarchyData = result.hierarchyData || null;
		const treeData = result.treeData || null;
		
		// Cache the data
		cacheHierarchy(hierarchyData, treeData);
		
		return hierarchyData;
	} catch (error) {
		console.error('[cluster-hierarchy] Error fetching hierarchy:', error);
		return null;
	}
}

