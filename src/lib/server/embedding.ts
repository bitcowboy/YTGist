import { OPENAI_API_KEY } from '$env/static/private';
import OpenAI from 'openai';

// Create OpenAI client directly (not through OpenRouter) for embedding generation
// DeepSeek and other models via OpenRouter don't support embeddings
const openai = new OpenAI({
	apiKey: OPENAI_API_KEY,
});

// Default embedding dimensions (can be overridden via parameter)
// Lower dimensions reduce storage and computation cost while maintaining good quality
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding for text using OpenAI text-embedding-3-small model
 * This function directly calls OpenAI API (not through OpenRouter) because
 * embedding models are only available from OpenAI directly.
 * @param text The text to generate embedding for
 * @param dimensions Optional. Number of dimensions for the embedding vector (default: 256)
 *                   For text-embedding-3-small, valid values are typically 256, 512, 768, 1024, 1536
 * @returns Embedding vector as number array
 */
export const generateEmbedding = async (text: string, dimensions: number = DEFAULT_EMBEDDING_DIMENSIONS): Promise<number[]> => {
	if (!text || text.trim().length === 0) {
		throw new Error('Text cannot be empty');
	}

	if (!OPENAI_API_KEY) {
		throw new Error('OPENAI_API_KEY is required for embedding generation');
	}

	// Validate dimensions (text-embedding-3-small supports various dimensions, typically 256-1536)
	if (dimensions < 256 || dimensions > 1536) {
		console.warn(`Invalid dimensions ${dimensions}, using default ${DEFAULT_EMBEDDING_DIMENSIONS}`);
		dimensions = DEFAULT_EMBEDDING_DIMENSIONS;
	}

	try {
		const response = await openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: text,
			// dimensions: dimensions
		});

		if (!response.data || response.data.length === 0) {
			throw new Error('No embedding data returned from API');
		}

		return response.data[0].embedding;
	} catch (error) {
		console.error('Failed to generate embedding:', error);
		if (error instanceof Error) {
			throw new Error(`Embedding generation failed: ${error.message}`);
		}
		throw new Error('Embedding generation failed: Unknown error');
	}
};

