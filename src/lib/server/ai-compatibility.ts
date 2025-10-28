/**
 * AI API Compatibility Layer
 * Handles differences between various AI providers and their JSON schema support
 */

import { OPENROUTER_MODEL, USE_JSON_SCHEMA } from '$env/static/private';

// Models that support JSON schema response_format
const SCHEMA_SUPPORTED_MODELS = [
	'openai/gpt-4o',
	'openai/gpt-4o-mini',
	'openai/gpt-4-turbo',
	'openai/gpt-3.5-turbo',
	'anthropic/claude-3-5-sonnet',
	'anthropic/claude-3-opus',
	'anthropic/claude-3-sonnet',
	'anthropic/claude-3-haiku',
	'meta-llama/llama-3.1-8b-instruct',
	'meta-llama/llama-3.1-70b-instruct',
	'meta-llama/llama-3.2-3b-instruct',
	'meta-llama/llama-3.2-11b-instruct',
	'meta-llama/llama-3.2-90b-instruct',
	'google/gemini-pro-1.5',
	'google/gemini-flash-1.5',
];

// Models that don't support JSON schema (like DeepSeek)
const SCHEMA_UNSUPPORTED_MODELS = [
	'deepseek/deepseek-chat',
	'deepseek/deepseek-coder',
	'deepseek/deepseek-v2',
	'deepseek/deepseek-v2.5',
];

/**
 * Check if the current model supports JSON schema response_format
 * Can be overridden by USE_JSON_SCHEMA environment variable
 */
export function supportsJsonSchema(): boolean {
	// Check environment variable first (default to true if not set)
	const useJsonSchema = USE_JSON_SCHEMA?.toLowerCase();
	return useJsonSchema === 'true' || useJsonSchema === '1' || useJsonSchema === 'yes';
}

/**
 * Generate a JSON format instruction for models that don't support schema
 */
export function generateJsonFormatInstruction(schema: any): string {
	const schemaDescription = describeSchema(schema);
	
	return `请严格按照以下JSON格式返回结果，不要包含任何其他文本或解释：

${schemaDescription}

请确保：
1. 返回的是有效的JSON格式
2. 包含所有必需字段
3. 数据类型正确
4. 不要包含额外的字段
5. 不要包含markdown代码块标记

直接返回JSON对象，不要任何前缀或后缀。`;
}

/**
 * Describe a JSON schema in human-readable format
 */
function describeSchema(schema: any): string {
	if (!schema || schema.type !== 'object') {
		return '返回一个JSON对象';
	}
	
	let description = '返回一个JSON对象，包含以下字段：\n';
	
	if (schema.required && schema.required.length > 0) {
		description += '\n必需字段：\n';
		for (const field of schema.required) {
			const fieldSchema = schema.properties[field];
			description += `- ${field}: ${describeFieldType(fieldSchema)}\n`;
		}
	}
	
	if (schema.properties) {
		const optionalFields = Object.keys(schema.properties).filter(
			field => !schema.required || !schema.required.includes(field)
		);
		
		if (optionalFields.length > 0) {
			description += '\n可选字段：\n';
			for (const field of optionalFields) {
				const fieldSchema = schema.properties[field];
				description += `- ${field}: ${describeFieldType(fieldSchema)}\n`;
			}
		}
	}
	
	return description;
}

/**
 * Describe a field type in human-readable format
 */
function describeFieldType(fieldSchema: any): string {
	if (!fieldSchema) {
		return '任意类型';
	}
	
	switch (fieldSchema.type) {
		case 'string':
			return '字符串';
		case 'number':
			return '数字';
		case 'boolean':
			return '布尔值';
		case 'array':
			if (fieldSchema.items) {
				return `数组，元素类型：${describeFieldType(fieldSchema.items)}`;
			}
			return '数组';
		case 'object':
			return '对象';
		default:
			return fieldSchema.type || '任意类型';
	}
}

/**
 * Parse JSON response with fallback handling
 */
export function parseJsonResponse(content: string, fallbackData: any = null): any {
	try {
		// Try to parse as-is
		return JSON.parse(content);
	} catch (error) {
		console.warn('Failed to parse JSON response:', error);
		
		// Try to extract JSON from markdown code blocks
		const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[1]);
			} catch (parseError) {
				console.warn('Failed to parse JSON from code block:', parseError);
			}
		}
		
		// Try to find JSON object in the text
		const objectMatch = content.match(/\{[\s\S]*\}/);
		if (objectMatch) {
			try {
				return JSON.parse(objectMatch[0]);
			} catch (parseError) {
				console.warn('Failed to parse JSON object:', parseError);
			}
		}
		
		// Return fallback data if provided
		if (fallbackData) {
			console.warn('Using fallback data due to JSON parsing failure');
			return fallbackData;
		}
		
		throw new Error('Failed to parse JSON response and no fallback provided');
	}
}

/**
 * Create OpenAI API request options with compatibility layer
 */
export function createApiRequestOptions(
	messages: any[],
	schema?: any,
	fallbackData?: any
): any {
	const baseOptions = {
		model: OPENROUTER_MODEL,
		messages: [...messages],
	};
	
	if (supportsJsonSchema() && schema) {
		// Use JSON schema for supported models
		return {
			...baseOptions,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "response",
					schema: schema
				}
			}
		};
	} else if (schema) {
		// Add JSON format instruction for unsupported models
		const formatInstruction = generateJsonFormatInstruction(schema);
		const systemMessage = messages.find(msg => msg.role === 'system');
		
		if (systemMessage) {
			// Append format instruction to existing system message
			systemMessage.content += '\n\n' + formatInstruction;
		} else {
			// Add new system message with format instruction
			messages.unshift({
				role: 'system',
				content: formatInstruction
			});
		}
		
		return baseOptions;
	}
	
	return baseOptions;
}

/**
 * Test function to verify environment variable configuration
 * Can be called from console or API endpoint for debugging
 */
export function testJsonSchemaConfig(): {
	model: string | undefined;
	useJsonSchemaEnv: string | undefined;
	supportsSchema: boolean;
	reason: string;
} {
	const model = OPENROUTER_MODEL;
	const useJsonSchemaEnv = process.env.USE_JSON_SCHEMA;
	const supportsSchema = supportsJsonSchema();
	
	let reason = '';
	if (useJsonSchemaEnv) {
		reason = `Environment variable USE_JSON_SCHEMA=${useJsonSchemaEnv} overrides automatic detection`;
	} else if (model) {
		const modelLower = model.toLowerCase();
		if (SCHEMA_UNSUPPORTED_MODELS.some(unsupported => modelLower.includes(unsupported))) {
			reason = `Model ${model} is in unsupported list`;
		} else if (SCHEMA_SUPPORTED_MODELS.some(supported => modelLower.includes(supported))) {
			reason = `Model ${model} is in supported list`;
		} else {
			reason = `Model ${model} is unknown, defaulting to true`;
		}
	} else {
		reason = 'No model specified, defaulting to true';
	}
	
	return {
		model,
		useJsonSchemaEnv,
		supportsSchema,
		reason
	};
}
