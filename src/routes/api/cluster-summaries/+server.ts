import { error, json } from '@sveltejs/kit';
import { validateNonce } from '$lib/server/nonce.js';
import { 
    getAllSummariesWithEmbeddings, 
    createCluster, 
    assignVideoToCluster, 
    clearClusterAssignments,
    updateClusterVideoCount,
    getOrCreateUncategorizedCluster
} from '$lib/server/database.js';
import { generateClusterName } from '$lib/server/cluster-name.js';
import { spawn } from 'child_process';
import { join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';

export const POST = async ({ request }) => {
    try {
        const { nonce, clearExisting = false } = await request.json();

        if (!nonce || !validateNonce(nonce)) {
            return error(401, 'Invalid or expired nonce!');
        }

        console.log('[cluster-summaries] Starting clustering process...');

        // Get all summaries with embeddings
        const summariesWithEmbeddings = await getAllSummariesWithEmbeddings();
        
        if (summariesWithEmbeddings.length < 2) {
            return json({
                success: true,
                message: 'Not enough summaries with embeddings to cluster',
                clusters: [],
                noise: summariesWithEmbeddings.map(s => s.videoId),
                totalClusters: 0,
                totalNoise: summariesWithEmbeddings.length
            });
        }

        console.log(`[cluster-summaries] Found ${summariesWithEmbeddings.length} summaries with embeddings`);

        // Clear existing clusters if requested
        if (clearExisting) {
            console.log('[cluster-summaries] Clearing existing cluster assignments...');
            await clearClusterAssignments();
        }

        // Prepare input data for Python script
        // Convert embeddings to base64-encoded binary format to preserve precision
        const inputData = {
            summaries: summariesWithEmbeddings.map(s => {
                // Convert number array to Float32Array, then to base64
                const float32Array = new Float32Array(s.embedding);
                const buffer = Buffer.from(float32Array.buffer);
                const base64Embedding = buffer.toString('base64');
                
                return {
                    videoId: s.videoId,
                    embedding: base64Embedding,
                    dimensions: s.embedding.length
                };
            })
        };

        // Call Python script - use project root directory
        const projectRoot = cwd();
        const pythonScriptPath = join(projectRoot, 'scripts', 'cluster_summaries.py');
        
        // Check if venv exists and use it, otherwise fall back to system Python
        let pythonCommand: string;
        const venvPythonPath = process.platform === 'win32' 
            ? join(projectRoot, 'venv', 'Scripts', 'python.exe')
            : join(projectRoot, 'venv', 'bin', 'python3');
        
        if (existsSync(venvPythonPath)) {
            pythonCommand = venvPythonPath;
            console.log('[cluster-summaries] Using Python from venv:', pythonCommand);
        } else {
            // Fall back to system Python
            pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
            console.log('[cluster-summaries] Using system Python:', pythonCommand);
        }
        
        const pythonProcess = spawn(pythonCommand, [pythonScriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32' && !pythonCommand.includes('venv')
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            const message = data.toString();
            stderr += message;
            // Real-time progress output to console
            console.log('[cluster-summaries] Python:', message.trim());
        });

        // Send input data to Python script
        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();

        // Wait for Python script to complete
        await new Promise<void>((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python script exited with code ${code}: ${stderr}`));
                } else {
                    resolve();
                }
            });
            pythonProcess.on('error', (err) => {
                reject(err);
            });
        });

        // Parse Python script output
        let clusteringResult;
        try {
            clusteringResult = JSON.parse(stdout);
        } catch (e) {
            throw new Error(`Failed to parse Python script output: ${stdout}`);
        }

        if (clusteringResult.error) {
            throw new Error(`Python script error: ${clusteringResult.error}`);
        }

        console.log(`[cluster-summaries] Clustering completed: ${clusteringResult.totalClusters} clusters, ${clusteringResult.totalNoise} noise points`);
        if (clusteringResult.totalReassigned) {
            console.log(`[cluster-summaries] Reassigned ${clusteringResult.totalReassigned} noise points to existing clusters`);
        }

        // Create a map of videoId to summary data for efficient lookup
        const summariesMap = new Map<string, { videoId: string; embedding: number[]; title: string; summary: string }>();
        for (const s of summariesWithEmbeddings) {
            summariesMap.set(s.videoId, s);
        }

        // Create clusters and assign videos
        const createdClusters = [];
        const totalClusters = clusteringResult.clusters.length;
        console.log(`[cluster-summaries] Creating ${totalClusters} clusters in database...`);
        
        for (let i = 0; i < clusteringResult.clusters.length; i++) {
            const clusterData = clusteringResult.clusters[i];
            const isWeakCluster = clusterData.isWeakCluster || false;
            const clusterType = isWeakCluster ? 'weak cluster' : 'cluster';
            console.log(`[cluster-summaries] Creating ${clusterType} ${i + 1}/${totalClusters}: ${clusterData.clusterId} (${clusterData.videoIds.length} videos)`);
            
            try {
                // Create cluster with temporary name
                const clusterDescription = isWeakCluster 
                    ? `Weak cluster (from noise points) containing ${clusterData.videoIds.length} videos`
                    : `Cluster containing ${clusterData.videoIds.length} videos`;
                const cluster = await createCluster(
                    clusterData.clusterId,
                    clusterDescription,
                    clusterData.videoIds.length
                );
                
                console.log(`[cluster-summaries] Assigning ${clusterData.videoIds.length} videos to cluster ${cluster.$id}...`);
                
                // Batch assign videos with delay to avoid timeout
                const batchSize = 50;
                for (let j = 0; j < clusterData.videoIds.length; j += batchSize) {
                    const batch = clusterData.videoIds.slice(j, j + batchSize);
                    const batchPromises = batch.map((videoId: string) => assignVideoToCluster(videoId, cluster.$id));
                    await Promise.all(batchPromises);
                    
                    if (j + batchSize < clusterData.videoIds.length) {
                        // Add delay between batches
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    
                    console.log(`[cluster-summaries] Assigned ${Math.min(j + batchSize, clusterData.videoIds.length)}/${clusterData.videoIds.length} videos`);
                }
                
                // Generate cluster name based on video titles
                console.log(`[cluster-summaries] Generating name for cluster ${cluster.$id}...`);
                let finalClusterName = cluster.name; // Default to temporary name
                
                try {
                    // Get video titles directly from summariesWithEmbeddings (no need to query database)
                    const videoTitles: string[] = [];
                    for (const videoId of clusterData.videoIds) {
                        const summaryData = summariesMap.get(videoId);
                        if (summaryData && summaryData.title) {
                            videoTitles.push(summaryData.title);
                        }
                    }
                    
                    if (videoTitles.length > 0) {
                        try {
                            const generatedName = await generateClusterName(videoTitles);
                            console.log(`[cluster-summaries] Generated name for cluster ${cluster.$id}: "${generatedName}"`);
                            
                            // Update cluster name in database
                            const { databases } = await import('$lib/server/appwrite.js');
                            await databases.updateDocument('main', 'clusters', cluster.$id, {
                                name: generatedName
                            });
                            
                            finalClusterName = generatedName;
                        } catch (nameGenError) {
                            console.error(`[cluster-summaries] Failed to generate name for cluster ${cluster.$id}:`, nameGenError);
                            // Use fallback name - cluster already has a default name, so we can continue
                            finalClusterName = `聚类（${clusterData.videoIds.length}个视频）`;
                            
                            // Try to update with fallback name (non-critical, so don't fail if this fails)
                            try {
                                const { databases } = await import('$lib/server/appwrite.js');
                                await databases.updateDocument('main', 'clusters', cluster.$id, {
                                    name: finalClusterName
                                });
                            } catch (updateError) {
                                console.warn(`[cluster-summaries] Failed to update cluster name with fallback:`, updateError);
                                // Continue anyway - cluster exists with default name
                            }
                        }
                    } else {
                        console.warn(`[cluster-summaries] No video titles found for cluster ${cluster.$id}, using default name`);
                    }
                } catch (err) {
                    console.error(`[cluster-summaries] Unexpected error generating name for cluster ${cluster.$id}:`, err);
                    // Cluster already exists with default name, continue
                }
                
                // Ensure cluster.name is set correctly for response
                cluster.name = finalClusterName;
                
                createdClusters.push({
                    clusterId: cluster.$id,
                    name: cluster.name,
                    videoCount: cluster.videoCount,
                    videoIds: clusterData.videoIds,
                    isWeakCluster: isWeakCluster
                });
            } catch (clusterError) {
                console.error(`[cluster-summaries] Failed to process cluster ${i + 1}/${totalClusters} (${clusterData.clusterId}):`, clusterError);
                // Continue processing other clusters even if one fails
                // Log error but don't throw - we want to process all clusters
            }
        }

        console.log(`[cluster-summaries] Created ${createdClusters.length} clusters in database`);

        // Handle noise videos - assign them to "未分类" cluster
        const noiseVideoIds = clusteringResult.noise || [];
        if (noiseVideoIds.length > 0) {
            console.log(`[cluster-summaries] Processing ${noiseVideoIds.length} noise videos, assigning to "未分类" cluster...`);
            try {
                const uncategorizedCluster = await getOrCreateUncategorizedCluster();
                console.log(`[cluster-summaries] Found/created "未分类" cluster: ${uncategorizedCluster.$id}`);
                
                // Batch assign noise videos to uncategorized cluster
                const batchSize = 50;
                let assignedCount = 0;
                for (let j = 0; j < noiseVideoIds.length; j += batchSize) {
                    const batch = noiseVideoIds.slice(j, j + batchSize);
                    const batchPromises = batch.map((videoId: string) => assignVideoToCluster(videoId, uncategorizedCluster.$id));
                    await Promise.all(batchPromises);
                    
                    assignedCount += batch.length;
                    console.log(`[cluster-summaries] Assigned ${assignedCount}/${noiseVideoIds.length} noise videos to "未分类" cluster`);
                    
                    if (j + batchSize < noiseVideoIds.length) {
                        // Add delay between batches
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
                
                // Update uncategorized cluster video count
                const { databases } = await import('$lib/server/appwrite.js');
                await databases.updateDocument('main', 'clusters', uncategorizedCluster.$id, {
                    videoCount: noiseVideoIds.length
                });
                
                console.log(`[cluster-summaries] Successfully assigned ${noiseVideoIds.length} noise videos to "未分类" cluster`);
            } catch (noiseError) {
                console.error(`[cluster-summaries] Failed to assign noise videos to "未分类" cluster:`, noiseError);
                // Continue anyway - noise videos are still tracked in the response
            }
        }

        return json({
            success: true,
            message: 'Clustering completed successfully',
            clusters: createdClusters,
            noise: noiseVideoIds,
            reassignedNoise: clusteringResult.reassignedNoise || [],
            totalClusters: clusteringResult.totalClusters || 0,
            totalNoise: noiseVideoIds.length,
            totalReassigned: clusteringResult.totalReassigned || 0,
            totalProcessed: summariesWithEmbeddings.length,
            hierarchyData: clusteringResult.hierarchyData || null // Add hierarchy information
        });

    } catch (err) {
        console.error('[cluster-summaries] Error:', err);
        return error(500, err instanceof Error ? err.message : 'Failed to perform clustering');
    }
};

