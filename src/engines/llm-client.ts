import Anthropic from '@anthropic-ai/sdk';

/**
 * Configuration for the LLM client
 */
export interface LLMClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<LLMClientConfig, 'apiKey'>> = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.0,
};

/**
 * Lazily initialized Anthropic client
 */
let anthropicClient: Anthropic | null = null;

/**
 * Get or create the Anthropic client
 */
function getClient(apiKey?: string): Anthropic | null {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return null;
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: key,
    });
  }

  return anthropicClient;
}

/**
 * Check if LLM is available (API key set)
 */
export function isLLMAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Extract JSON from markdown code blocks or raw text
 */
function extractJSON(text: string): unknown {
  // Try to extract from ```json blocks
  const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return JSON.parse(jsonBlockMatch[1]);
  }

  // Try to extract from ``` blocks without language
  const codeBlockMatch = text.match(/```\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return JSON.parse(codeBlockMatch[1]);
  }

  // Try parsing the raw text
  return JSON.parse(text.trim());
}

/**
 * Call Claude with a structured prompt and get back parsed JSON.
 * Returns null if LLM is unavailable or call fails.
 *
 * @param systemPrompt - System-level instructions
 * @param userPrompt - The actual content/question
 * @param config - Optional overrides
 * @returns Parsed JSON response or null on failure
 */
export async function callLLM<T>(
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LLMClientConfig>
): Promise<T | null> {
  const client = getClient(config?.apiKey);

  if (!client) {
    return null;
  }

  try {
    const response = await client.messages.create({
      model: config?.model ?? DEFAULT_CONFIG.model,
      max_tokens: config?.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      temperature: config?.temperature ?? DEFAULT_CONFIG.temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    if (!textContent) {
      console.error('LLM response contained no text content');
      return null;
    }

    // Parse JSON from response
    try {
      const parsed = extractJSON(textContent.text);
      return parsed as T;
    } catch (parseError) {
      console.error('Failed to parse JSON from LLM response:', parseError);
      console.error('Response text:', textContent.text);
      return null;
    }
  } catch (error) {
    console.error('LLM call failed:', error);
    return null;
  }
}

/**
 * Call Claude for text analysis (non-JSON response).
 * Returns null if LLM is unavailable or call fails.
 */
export async function callLLMText(
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LLMClientConfig>
): Promise<string | null> {
  const client = getClient(config?.apiKey);

  if (!client) {
    return null;
  }

  try {
    const response = await client.messages.create({
      model: config?.model ?? DEFAULT_CONFIG.model,
      max_tokens: config?.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      temperature: config?.temperature ?? DEFAULT_CONFIG.temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    if (!textContent) {
      console.error('LLM response contained no text content');
      return null;
    }

    return textContent.text;
  } catch (error) {
    console.error('LLM call failed:', error);
    return null;
  }
}
