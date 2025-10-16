import { databases } from './appwrite.js';
import { ID, Query } from 'node-appwrite';
import type { SummaryData } from '$lib/types.js';

// 数据库表名常量
export const COLLECTIONS = {
    SUMMARIES: 'summaries'
} as const;

// Summary 相关操作
export const getSummary = async (videoId: string): Promise<SummaryData | null> => {
    try {
        const { documents } = await databases.listDocuments<SummaryData>(
            'main',
            COLLECTIONS.SUMMARIES,
            [Query.equal('videoId', videoId)]
        );
        return documents.length > 0 ? documents[0] : null;
    } catch (error) {
        console.error('Failed to get summary:', error);
        return null;
    }
};

export const createSummary = async (summaryData: {
    videoId: string;
    title: string;
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    hasSubtitles?: boolean;
}): Promise<SummaryData> => {
    return await databases.createDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        ID.unique(),
        {
            ...summaryData,
            hits: 0
        }
    );
};

export const updateSummary = async (videoId: string, updateData: Partial<{
    title: string;
    summary: string;
    keyTakeaway: string;
    keyPoints: string[];
    coreTerms: string[];
    hasSubtitles: boolean;
    hits: number;
}>): Promise<SummaryData> => {
    const existing = await getSummary(videoId);
    if (!existing) {
        throw new Error('Summary not found');
    }
    
    return await databases.updateDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        existing.$id,
        updateData
    );
};

export const incrementSummaryHits = async (videoId: string): Promise<SummaryData> => {
    const existing = await getSummary(videoId);
    if (!existing) {
        throw new Error('Summary not found');
    }
    
    return await databases.updateDocument<SummaryData>(
        'main',
        COLLECTIONS.SUMMARIES,
        existing.$id,
        { hits: (existing.hits || 0) + 1 }
    );
};

// 组合操作 - 获取完整的视频数据
// 单表模式不再提供组合查询与跨表检查
