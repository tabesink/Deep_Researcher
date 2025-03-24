import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const baseUrl = process.env.OPENAI_API_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  if (!baseUrl) {
    throw new Error("OPENAI_API_URL is not set");
  }

  const envModel = process.env.OPENAI_MODEL;
  if (envModel) {
    return NextResponse.json({
      object: "list",
      data: [
        {
          id: envModel,
        },
      ],
    });
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (res.status !== 200) {
      const statusText = res.statusText;
      const responseBody = await res.text();
      console.error(`OpenAI /models response error: ${responseBody}`);
      return NextResponse.json(
        {
          success: false,
          error: statusText,
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    // Filter for only chat models
    const chatModels = data.data.filter((model: any) => 
      model.id.includes("gpt") && !model.id.includes("instruct")
    );
    
    return NextResponse.json({
      object: "list",
      data: chatModels,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
