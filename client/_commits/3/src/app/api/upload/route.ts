import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Generate a user ID for this upload
    const userId = uuidv4();

    // Get the API URL from environment variables
    const apiUrl = process.env.API_BASE_URL;
    if (!apiUrl) {
      throw new Error("API_BASE_URL is not set");
    }

    // Forward the file to your Python backend
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    
    const response = await fetch(`${apiUrl}/upload?user_id=${userId}`, {
      method: "POST",
      body: uploadFormData,
    });

    if (!response.ok) {
      throw new Error("Failed to upload to backend");
    }

    const result = await response.json();
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// Increase payload size limit for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
}; 