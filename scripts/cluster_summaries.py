#!/usr/bin/env python3
"""
HDBSCAN clustering script for video summaries.
Reads embeddings from stdin (JSON format) and outputs clustering results to stdout.
Progress messages are sent to stderr.
"""

import json
import sys
import warnings
import numpy as np
from hdbscan import HDBSCAN
from hdbscan.prediction import all_points_membership_vectors
from scipy.spatial.distance import pdist, squareform
from umap import UMAP

# Suppress sklearn deprecation warnings
warnings.filterwarnings('ignore', category=FutureWarning, module='sklearn')
from sklearn.preprocessing import normalize

def main():
    try:
        print('[Python] Reading input data...', file=sys.stderr)
        # Read input from stdin
        input_data = json.load(sys.stdin)
        
        if not input_data or 'summaries' not in input_data:
            print(json.dumps({'error': 'Invalid input: missing summaries field'}), file=sys.stderr)
            sys.exit(1)
        
        summaries = input_data['summaries']
        total_count = len(summaries)
        print(f'[Python] Loaded {total_count} summaries', file=sys.stderr)
        
        if total_count < 2:
            # Not enough data to cluster
            result = {
                'clusters': [],
                'noise': [s['videoId'] for s in summaries] if summaries else []
            }
            print(json.dumps(result))
            return
        
        print('[Python] Extracting embeddings...', file=sys.stderr)
        # Extract embeddings and video IDs
        # Embeddings are passed as base64-encoded binary data to preserve precision
        import base64
        
        video_ids = []
        embeddings_list = []
        
        for s in summaries:
            video_ids.append(s['videoId'])
            
            # Check if embedding is base64-encoded binary or JSON array
            embedding_data = s['embedding']
            if isinstance(embedding_data, str):
                # Try to decode as base64 first
                try:
                    # Decode base64 to bytes
                    embedding_bytes = base64.b64decode(embedding_data)
                    # Convert bytes to numpy float32 array
                    embedding_array = np.frombuffer(embedding_bytes, dtype=np.float32)
                    embeddings_list.append(embedding_array)
                except Exception:
                    # Fallback to JSON parsing if base64 decode fails
                    try:
                        embedding_array = np.array(json.loads(embedding_data), dtype=np.float32)
                        embeddings_list.append(embedding_array)
                    except Exception:
                        print(f'[Python] Warning: Failed to parse embedding for video {s["videoId"]}', file=sys.stderr)
                        # Skip this video
                        continue
            elif isinstance(embedding_data, list):
                # Direct array (shouldn't happen with new format, but handle for compatibility)
                embeddings_list.append(np.array(embedding_data, dtype=np.float32))
            else:
                print(f'[Python] Warning: Unknown embedding format for video {s["videoId"]}', file=sys.stderr)
                continue
        
        # Filter out videos with invalid embeddings
        valid_indices = [i for i, emb in enumerate(embeddings_list) if emb is not None and len(emb) > 0]
        video_ids = [video_ids[i] for i in valid_indices]
        embeddings_list = [embeddings_list[i] for i in valid_indices]
        
        if len(embeddings_list) == 0:
            print('[Python] Error: No valid embeddings found', file=sys.stderr)
            sys.exit(1)
        
        # Convert to numpy array
        embeddings = np.array(embeddings_list)
        print(f'[Python] Embeddings shape: {embeddings.shape}', file=sys.stderr)
        
        # print('[Python] Applying UMAP dimensionality reduction...', file=sys.stderr)
        # Apply UMAP for dimensionality reduction
        # Reduce from original dimension (e.g., 1536) to a lower dimension (e.g., 50)
        # This helps preserve local and global structure while reducing computational cost
        n_components = min(50, embeddings.shape[1] - 1)  # Reduce to 50 dimensions or less
        umap_reducer = UMAP(
            n_components=n_components,
            metric='cosine',
            n_neighbors=50,
            min_dist=0.0,
        )
        embeddings_reduced = umap_reducer.fit_transform(embeddings)
        print(f'[Python] UMAP reduction completed: {embeddings.shape[1]}D -> {embeddings_reduced.shape[1]}D', file=sys.stderr)
        
        print('[Python] Normalizing embeddings after UMAP (L2 normalization)...', file=sys.stderr)
        # UMAP may change vector magnitudes, so re-normalize for cosine distance
        embeddings_normalized = normalize(embeddings_reduced, norm='l2')
        print(f'[Python] Embeddings normalized shape: {embeddings_normalized.shape}', file=sys.stderr)
        
        print('[Python] Starting HDBSCAN clustering with precomputed cosine distances...', file=sys.stderr)
        # Enable prediction_data for soft clustering
        clusterer = HDBSCAN(
            min_cluster_size=3, 
            min_samples=1, 
            # cluster_selection_epsilon=0.01, 
            metric='euclidean',
            prediction_data=True
        )
        cluster_labels = clusterer.fit_predict(embeddings_normalized)
        print('[Python] Clustering completed!', file=sys.stderr)
        
        # Extract hierarchical structure from condensed_tree
        print('[Python] Extracting condensed_tree hierarchy...', file=sys.stderr)
        hierarchy_data = None
        try:
            if hasattr(clusterer, 'condensed_tree_') and clusterer.condensed_tree_ is not None:
                import pandas as pd
                condensed_tree_df = clusterer.condensed_tree_.to_pandas()
                
                # Get unique lambda values sorted in descending order
                lambda_values = sorted(condensed_tree_df['lambda_val'].unique(), reverse=True)
                print(f'[Python] Found {len(lambda_values)} unique lambda values', file=sys.stderr)
                
                # Sample lambda values for performance (max 50 levels)
                if len(lambda_values) > 50:
                    indices = np.linspace(0, len(lambda_values) - 1, 50, dtype=int)
                    lambda_values = [lambda_values[i] for i in indices]
                    print(f'[Python] Sampled to {len(lambda_values)} lambda values', file=sys.stderr)
                
                hierarchy_levels = []
                
                # Build a mapping from tree node to data points
                # In condensed tree: child < n_samples means it's a data point
                n_samples = len(video_ids)
                
                # For each lambda, find which clusters exist and their members
                for i, lambda_val in enumerate(lambda_values):
                    try:
                        # Get all tree rows at or above this lambda value
                        rows_at_lambda = condensed_tree_df[condensed_tree_df['lambda_val'] >= lambda_val]
                        
                        # Build union-find structure to track cluster membership
                        parent = list(range(n_samples * 2))  # Enough space for data points and internal nodes
                        
                        def find(x):
                            if parent[x] != x:
                                parent[x] = find(parent[x])
                            return parent[x]
                        
                        def union(x, y):
                            px, py = find(x), find(y)
                            if px != py:
                                parent[px] = py
                        
                        # Process splits/merges in the tree
                        for _, row in rows_at_lambda.iterrows():
                            child = int(row['child'])
                            parent_node = int(row['parent'])
                            
                            # Union child with parent
                            if child < n_samples:
                                # Child is a data point
                                union(child, parent_node)
                            else:
                                # Child is an internal node
                                union(child, parent_node)
                        
                        # Group data points by their root
                        clusters_map = {}
                        for point_idx in range(n_samples):
                            root = find(point_idx)
                            if root not in clusters_map:
                                clusters_map[root] = []
                            clusters_map[root].append(video_ids[point_idx])
                        
                        # Filter out single-point "clusters" (noise)
                        level_clusters = {}
                        level_noise = []
                        cluster_id = 0
                        
                        for root, members in clusters_map.items():
                            if len(members) >= clusterer.min_cluster_size:
                                level_clusters[cluster_id] = members
                                cluster_id += 1
                            else:
                                level_noise.extend(members)
                        
                        # Convert to output format
                        cluster_assignments = [
                            {
                                'clusterId': f'lambda_{lambda_val:.4f}_cluster_{cid}',
                                'videoIds': vids,
                                'size': len(vids)
                            }
                            for cid, vids in level_clusters.items()
                        ]
                        
                        hierarchy_levels.append({
                            'lambda': float(lambda_val),
                            'clusters': cluster_assignments,
                            'noiseCount': len(level_noise),
                            'clusterCount': len(cluster_assignments)
                        })
                        
                        if (i + 1) % 10 == 0 or i == 0:
                            print(f'[Python] Level {i+1}/{len(lambda_values)}: lambda={lambda_val:.4f}, {len(cluster_assignments)} clusters, {len(level_noise)} noise', file=sys.stderr)
                        
                    except Exception as e:
                        print(f'[Python] Warning: Failed to extract clusters at lambda={lambda_val}: {e}', file=sys.stderr)
                        import traceback
                        traceback.print_exc(file=sys.stderr)
                        continue
                
                if len(hierarchy_levels) > 0:
                    lambda_range = [float(min(lambda_values)), float(max(lambda_values))]
                    hierarchy_data = {
                        'lambdaRange': lambda_range,
                        'levels': hierarchy_levels
                    }
                    print(f'[Python] Successfully extracted {len(hierarchy_levels)} hierarchy levels', file=sys.stderr)
                    print(f'[Python] Lambda range: {lambda_range[0]:.4f} to {lambda_range[1]:.4f}', file=sys.stderr)
                else:
                    print('[Python] Warning: No valid hierarchy levels extracted', file=sys.stderr)
            else:
                print('[Python] Warning: condensed_tree not available', file=sys.stderr)
        except Exception as e:
            print(f'[Python] Warning: Failed to extract hierarchy: {e}', file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        print('[Python] Organizing results...', file=sys.stderr)
        # Organize initial results
        clusters = {}
        noise_indices = []
        
        for idx, label in enumerate(cluster_labels):
            video_id = video_ids[idx]
            if label == -1:
                # Noise point (not assigned to any cluster)
                noise_indices.append(idx)
            else:
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append(video_id)
        
        print(f'[Python] Found {len(clusters)} clusters and {len(noise_indices)} noise points', file=sys.stderr)
        
        # Initialize variables for soft clustering results
        reassigned_noise = []
        weak_clusters = {}
        
        # Get membership vectors for soft clustering
        print('[Python] Computing membership vectors for soft clustering...', file=sys.stderr)
        try:
            # Check if we have any clusters before computing membership vectors
            if len(clusters) == 0:
                print('[Python] No clusters found, skipping soft clustering...', file=sys.stderr)
                # All points are noise, perform secondary clustering if possible
                if len(noise_indices) >= 2:
                    print(f'[Python] Performing secondary clustering on {len(noise_indices)} noise points...', file=sys.stderr)
                    unassigned_embeddings = embeddings_normalized[noise_indices]
                    secondary_min_cluster_size = input_data.get('secondary_min_cluster_size', 3)
                    secondary_clusterer = HDBSCAN(
                        min_cluster_size=secondary_min_cluster_size,
                        min_samples=1,
                        cluster_selection_epsilon=0.01,
                        metric='euclidean'
                    )
                    secondary_labels = secondary_clusterer.fit_predict(unassigned_embeddings)
                    
                    for i, label in enumerate(secondary_labels):
                        noise_idx = noise_indices[i]
                        video_id = video_ids[noise_idx]
                        if label == -1:
                            if 'noise' not in weak_clusters:
                                weak_clusters['noise'] = []
                            weak_clusters['noise'].append(video_id)
                        else:
                            weak_cluster_id = f'weak_cluster_{label}'
                            if weak_cluster_id not in weak_clusters:
                                weak_clusters[weak_cluster_id] = []
                            weak_clusters[weak_cluster_id].append(video_id)
                else:
                    # Not enough points for clustering
                    for noise_idx in noise_indices:
                        video_id = video_ids[noise_idx]
                        if 'noise' not in weak_clusters:
                            weak_clusters['noise'] = []
                        weak_clusters['noise'].append(video_id)
            else:
                membership_vectors = all_points_membership_vectors(clusterer)
                print(f'[Python] Membership vectors shape: {membership_vectors.shape}', file=sys.stderr)
                
                # Membership vectors columns directly correspond to cluster labels from fit_predict()
                # Column 0 -> label 0, Column 1 -> label 1, etc.
                # No mapping needed - the column index IS the cluster label
                num_clusters = membership_vectors.shape[1]
                print(f'[Python] Number of clusters for soft clustering: {num_clusters}', file=sys.stderr)
                
                # Threshold for reassigning noise points (default 0.1)
                membership_threshold = input_data.get('membership_threshold', 0.1)
                print(f'[Python] Using membership threshold: {membership_threshold}', file=sys.stderr)
                
                # Reassign noise points based on membership strength
                unassigned_noise_indices = []
                
                for noise_idx in noise_indices:
                    video_id = video_ids[noise_idx]
                    # Get membership vector for this noise point
                    if num_clusters > 0 and membership_vectors.shape[1] > 0:
                        # Find the maximum membership strength
                        max_membership = np.max(membership_vectors[noise_idx])
                        max_cluster_idx = np.argmax(membership_vectors[noise_idx])
                        
                        # max_cluster_idx is the column index, which directly corresponds to the cluster label
                        target_cluster_label = max_cluster_idx
                        
                        if max_membership >= membership_threshold and target_cluster_label in clusters:
                            # Reassign to the cluster with highest membership
                            clusters[target_cluster_label].append(video_id)
                            reassigned_noise.append({
                                'videoId': video_id,
                                'originalCluster': -1,
                                'reassignedTo': int(target_cluster_label),
                                'membershipStrength': float(max_membership)
                            })
                            print(f'[Python] Reassigned noise point {video_id} to cluster {target_cluster_label} (strength: {max_membership:.3f})', file=sys.stderr)
                        else:
                            unassigned_noise_indices.append(noise_idx)
                    else:
                        unassigned_noise_indices.append(noise_idx)
                
                print(f'[Python] Reassigned {len(reassigned_noise)} noise points, {len(unassigned_noise_indices)} remain unassigned', file=sys.stderr)
                
                # Secondary clustering for unassigned noise points
                if len(unassigned_noise_indices) >= 2:
                    print(f'[Python] Performing secondary clustering on {len(unassigned_noise_indices)} unassigned noise points...', file=sys.stderr)
                    
                    # Extract embeddings for unassigned noise points
                    unassigned_embeddings = embeddings_normalized[unassigned_noise_indices]
                    
                    # Use smaller min_cluster_size for secondary clustering (default 2)
                    secondary_min_cluster_size = input_data.get('secondary_min_cluster_size', 3)
                    secondary_clusterer = HDBSCAN(
                        min_cluster_size=secondary_min_cluster_size,
                        min_samples=1,
                        cluster_selection_epsilon=0.01,
                        metric='euclidean'
                    )
                    secondary_labels = secondary_clusterer.fit_predict(unassigned_embeddings)
                    
                    # Organize secondary clusters
                    for i, label in enumerate(secondary_labels):
                        noise_idx = unassigned_noise_indices[i]
                        video_id = video_ids[noise_idx]
                        
                        if label == -1:
                            # Still noise after secondary clustering
                            if 'noise' not in weak_clusters:
                                weak_clusters['noise'] = []
                            weak_clusters['noise'].append(video_id)
                        else:
                            # New weak cluster
                            weak_cluster_id = f'weak_cluster_{label}'
                            if weak_cluster_id not in weak_clusters:
                                weak_clusters[weak_cluster_id] = []
                            weak_clusters[weak_cluster_id].append(video_id)
                    
                    print(f'[Python] Secondary clustering created {len([k for k in weak_clusters.keys() if k != "noise"])} weak clusters and {len(weak_clusters.get("noise", []))} remaining noise points', file=sys.stderr)
                else:
                    # Not enough points for secondary clustering, add to noise
                    for noise_idx in unassigned_noise_indices:
                        video_id = video_ids[noise_idx]
                        if 'noise' not in weak_clusters:
                            weak_clusters['noise'] = []
                        weak_clusters['noise'].append(video_id)
            
        except Exception as e:
            print(f'[Python] Warning: Failed to compute membership vectors: {e}', file=sys.stderr)
            print('[Python] Falling back to basic clustering without soft clustering...', file=sys.stderr)
            # Fallback: treat all noise as unassigned
            unassigned_noise_indices = noise_indices
            weak_clusters = {'noise': [video_ids[idx] for idx in unassigned_noise_indices]}
            reassigned_noise = []
        
        # Collect final noise points
        final_noise = weak_clusters.get('noise', [])
        
        # Convert clusters to list format
        cluster_list = [
            {
                'clusterId': f'cluster_{label}',
                'videoIds': video_ids_list
            }
            for label, video_ids_list in clusters.items()
        ]
        
        # Convert weak clusters to list format
        weak_cluster_list = [
            {
                'clusterId': cluster_id,
                'videoIds': video_ids_list,
                'isWeakCluster': True
            }
            for cluster_id, video_ids_list in weak_clusters.items()
            if cluster_id != 'noise'
        ]
        
        # Combine all clusters
        all_clusters = cluster_list + weak_cluster_list
        
        result = {
            'clusters': all_clusters,
            'noise': final_noise,
            'reassignedNoise': reassigned_noise,
            'totalClusters': len(all_clusters),
            'totalNoise': len(final_noise),
            'totalReassigned': len(reassigned_noise),
            'hierarchyData': hierarchy_data  # Add hierarchy information
        }
        
        print('[Python] Outputting results...', file=sys.stderr)
        # Output result to stdout
        print(json.dumps(result))
        
    except Exception as e:
        error_msg = {
            'error': str(e),
            'type': type(e).__name__
        }
        print(f'[Python] Error: {e}', file=sys.stderr)
        print(json.dumps(error_msg), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()

