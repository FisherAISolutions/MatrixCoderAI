import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { PRIMARY_MODEL } from '@/lib/ai/modelConfig';
import { normalizeChatCompletionParameters } from '@/lib/ai/parameterNormalization';
import { requireServerEnv } from '@/lib/env';
import { logError, publicErrorMessage } from '@/lib/logger';
import { rejectIfRequestTooLarge } from '@/lib/api/hardening';
import { normalizeStyleBrief, MAX_STYLE_SCREENSHOTS } from '@/lib/styleInspiration';
import {
  buildMatrixCoderStylePrompt,
  buildProfileTitle,
  buildStyleAnalysisPrompt,
  extractJsonObject,
  styleBriefFromJson,
} from '@/lib/styleInspirationPrompt';

type AnalyzeImageInput = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

type AnalyzeRequestBody = {
  appName?: string;
  feedback?: string;
  images?: AnalyzeImageInput[];
};

const MAX_DATA_URL_CHARS = 7_000_000;
const MAX_ANALYZE_BODY_BYTES = 24 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const tooLarge = rejectIfRequestTooLarge(request, MAX_ANALYZE_BODY_BYTES);
  if (tooLarge) return tooLarge;

  try {
    const body = (await request.json()) as AnalyzeRequestBody;
    const appName = typeof body.appName === 'string' ? body.appName.trim() : '';
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
    const images = Array.isArray(body.images) ? body.images : [];

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'Upload at least one screenshot before analysis.' },
        { status: 400 }
      );
    }

    if (images.length > MAX_STYLE_SCREENSHOTS) {
      return NextResponse.json(
        { error: `Upload no more than ${MAX_STYLE_SCREENSHOTS} screenshots.` },
        { status: 400 }
      );
    }

    const invalid = images.find((image) => !isValidDataUrlImage(image));
    if (invalid) {
      return NextResponse.json(
        { error: `${invalid.name || 'A screenshot'} is not a valid PNG, JPG, or WebP data URL.` },
        { status: 400 }
      );
    }
    const apiKey = requireServerEnv('OPENAI_API_KEY');

    const prompt = buildStyleAnalysisPrompt({
      appName,
      feedback,
      imageCount: images.length,
    });

    const userContent: any[] = [
      {
        type: 'text',
        text: prompt,
      },
      ...images.map((image) => ({
        type: 'image_url',
        image_url: {
          url: image.dataUrl,
        },
      })),
    ];

    const openai = new OpenAI({ apiKey });
    const params = normalizeChatCompletionParameters(PRIMARY_MODEL, {
      max_tokens: 3000,
    });

    const completion = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior product designer and frontend engineer. Return compact valid JSON only.',
        },
        {
          role: 'user',
          content: userContent,
        },
      ] as any,
      stream: false,
      ...params,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const json = extractJsonObject(raw);
    if (!json) {
      return NextResponse.json(
        {
          error: 'The AI response did not contain a valid style brief.',
          details: raw.slice(0, 1000),
        },
        { status: 502 }
      );
    }

    const styleBrief = normalizeStyleBrief(styleBriefFromJson(json));
    const title = buildProfileTitle(appName);
    const promptBlock = buildMatrixCoderStylePrompt({
      title,
      appName,
      feedback,
      styleBrief,
      promptBlock: '',
    });

    return NextResponse.json({
      title,
      appName,
      feedback,
      styleBrief,
      promptBlock,
      model: PRIMARY_MODEL,
    });
  } catch (error) {
    logError('style-inspiration analyze error', error, {
      operation: 'style-inspiration-analyze',
    });
    return NextResponse.json(
      {
        error: 'Style analysis failed.',
        details: publicErrorMessage('Style analysis failed.', error, {
          exposeInDevelopment: true,
        }),
      },
      { status: 500 }
    );
  }
}

function isValidDataUrlImage(image: AnalyzeImageInput): boolean {
  if (!image || typeof image !== 'object') return false;
  if (typeof image.name !== 'string' || typeof image.mimeType !== 'string') return false;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) return false;
  if (typeof image.dataUrl !== 'string') return false;
  if (image.dataUrl.length > MAX_DATA_URL_CHARS) return false;
  return image.dataUrl.startsWith(`data:${image.mimeType};base64,`);
}


