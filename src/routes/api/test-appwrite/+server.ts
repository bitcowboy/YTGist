import { databases } from '$lib/server/appwrite.js';
import { error, json } from '@sveltejs/kit';

export const GET = async () => {
    try {
        console.log('测试 Appwrite 连接...');
        
        // 测试连接
        const collections = await databases.listCollections('main');
        console.log('✅ Appwrite 连接成功');
        console.log('当前集合数量:', collections.total);
        console.log('集合列表:', collections.collections.map(c => c.name));
        
        return json({ 
            success: true, 
            message: 'Appwrite 连接成功',
            collections: collections.collections.map(c => ({
                name: c.name,
                id: c.$id
            }))
        });
    } catch (e) {
        console.error('❌ Appwrite 连接失败:', e);
        return error(500, 'Appwrite 连接失败: ' + e.message);
    }
};
