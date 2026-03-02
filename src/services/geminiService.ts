import { GoogleGenAI, Type } from "@google/genai";

// Online-only mode – reads from Vite environment variables
const isMeta = typeof import.meta !== 'undefined' && import.meta.env;
const geminiKey = isMeta ? import.meta.env.VITE_GEMINI_API_KEY : process.env.VITE_GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: geminiKey || '' });

const ADMIN_SYSTEM_INSTRUCTION = `You are an expert on Kuwait Private Sector Labor Law (No. 6/2010). When calculating or discussing end-of-service indemnity:
1. USE 18 MONTHS AS THE LIMIT: Never exceed a total payout of 18 times the current monthly remuneration for monthly-paid staff (this is the same as the 1.5-year cap mentioned in Article 51).
2. DIVISOR: Always use 26 as the divisor to find the daily wage from a monthly salary.
3. INDEMNITY RATES:
   - First 5 years = 15 days' salary per year.
   - 6th year onwards = 30 days' (1 full month) salary per year.
4. RESIGNATION RULE: If the user specifies 'Resignation', apply Article 53 percentages: 0% for <3yrs, 50% for 3-5yrs, 66.6% for 5-10yrs, and 100% for 10+ years.
5. FORMAT: Show the 'Raw Total' first, then show the '18-month Cap', and finally the 'Total Payable'.
If asked for JSON, return ONLY valid JSON without markdown blocks. Prioritize professional corporate terminology.`;

/**
 * Helper to identify if we are routing through a local node
 */
export const getActiveAiProvider = () => {
  const url = localStorage.getItem('ai_provider_url');
  return (url && url.trim() !== '') ? 'Local' : 'Gemini';
};

/**
 * Generic task runner for all AI operations in the portal.
 * Respects the 'Local Intelligence Bridge' configuration.
 */
export const runAiTask = async (prompt: string, isJson: boolean = false, systemInstruction: string = ADMIN_SYSTEM_INSTRUCTION) => {
  const localEndpoint = localStorage.getItem('ai_provider_url');
  const localModel = localStorage.getItem('ai_provider_model') || 'qwen2.5';
  const localKey = localStorage.getItem('ai_provider_key');

  // Path 1: Local/Custom AI Bridge (Ollama or OpenAI Compatible)
  if (localEndpoint && localEndpoint.trim() !== '') {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localKey && localKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${localKey}`;
      }

      const isOpenAi = localEndpoint.includes('/v1/chat/completions');
      const isOllamaChat = localEndpoint.includes('/api/chat');

      let body: any;

      if (isOpenAi) {
        body = {
          model: localModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt }
          ],
          response_format: isJson ? { type: "json_object" } : undefined,
          temperature: 0.1
        };
      } else if (isOllamaChat) {
        body = {
          model: localModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt }
          ],
          stream: false,
          format: isJson ? "json" : undefined
        };
      } else {
        // Default Ollama /api/generate format
        body = {
          model: localModel,
          prompt: prompt,
          system: systemInstruction,
          stream: false,
          format: isJson ? "json" : undefined,
          options: { temperature: 0.1 }
        };
      }

      const response = await fetch(localEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI Provider Error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      let content = "";

      if (isOpenAi) {
        content = data.choices?.[0]?.message?.content || "";
      } else {
        content = data.response || data.message?.content || "";
      }

      // Clean up potential markdown code blocks
      if (isJson && typeof content === 'string') {
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
      }

      return content;
    } catch (e: any) {
      console.error("AI Bridge Failed:", e);
      throw new Error(`Intelligence node unreachable: ${e.message}`);
    }
  }

  // Path 2: Cloud Gemini (Primary Online Path using @google/genai)
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: isJson ? "application/json" : "text/plain"
      }
    });

    return response.text;
  } catch (e: any) {
    console.error("Cloud AI Error:", e);
    throw new Error("Cloud AI engine failed. Check VITE_GEMINI_API_KEY or connection.");
  }
};

/**
 * Legacy wrapper for Kuwaitization specific insights
 */
export const getKuwaitizationInsights = async (employeeData: string) => {
  const prompt = `
    Analyze the following employee data in the context of Kuwait's nationalization (Kuwaitization) policy.
    The goal is to increase Kuwaiti national participation in the private sector.
    
    Data:
    ${employeeData}
    
    Provide a JSON response with exactly these keys:
    {
      "summary": "string",
      "recommendations": ["string", "string"],
      "complianceStatus": "Compliant" | "Warning" | "Critical"
    }
    Return valid JSON only.
  `;

  try {
    const text = await runAiTask(prompt, true);
    return JSON.parse(text.trim());
  } catch (error) {
    console.error("Inference Error:", error);
    return {
      summary: "The intelligence node returned an unparseable response.",
      recommendations: [
        "Check connection settings in Admin > Connectors.",
        "Verify model name is exactly as shown in Ollama list.",
        "If using local AI, ensure OLLAMA_ORIGINS='*' is set."
      ],
      complianceStatus: "Warning"
    };
  }
};

/**
 * Legacy wrapper for administrative task resolutions
 */
export const runAdminTask = async (taskType: string, payload: any) => {
  let prompt = "";

  switch (taskType) {
    case 'CONFLICT_RESOLUTION':
      prompt = `I have two conflicting records for Employee ID ${payload.id}. Source A shows: ${JSON.stringify(payload.sourceA)} Source B shows: ${JSON.stringify(payload.sourceB)}. Recommend truth based on policy.`;
      break;
    default:
      prompt = `Assist with this HR Operations request: ${payload.customPrompt}`;
  }

  try {
    return await runAiTask(prompt);
  } catch (error) {
    console.error("Admin Task Error:", error);
    return "The system assistant encountered an error while processing the request. Intelligence node may be offline.";
  }
};

/**
 * Enhanced Vision Analysis for Receipts (Claims)
 */
export const analyzeReceipt = async (base64Image: string) => {
  const prompt = "Analyze this receipt image. Extract exactly these 3 fields as a JSON object: amount (number, value only in KWD), date (format: YYYY-MM-DD), and merchant (string). Return only the JSON.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: {
        parts: [
          { inlineData: { data: base64Image.split(',')[1], mimeType: "image/jpeg" } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    let text = response.text;
    // Clean potential markdown
    if (typeof text === 'string') {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    return JSON.parse(text || '{}');
  } catch (error) {
    console.error("Receipt Analysis Failed:", error);
    throw error;
  }
};
