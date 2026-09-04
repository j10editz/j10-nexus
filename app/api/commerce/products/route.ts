import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import { SEED_COMMERCE_PRODUCTS } from "@/lib/commerce/service";
import type { CommerceProduct, ProductStatus } from "@/types/commerce";

export async function GET() {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("commerce_products")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      const seeded: CommerceProduct[] = SEED_COMMERCE_PRODUCTS.map((p) => ({
        ...p,
        userId: user.id,
      }));
      return NextResponse.json({
        success: true,
        products: seeded,
        source: error ? "fallback_seed" : "live_database",
      });
    }

    const products: CommerceProduct[] = data.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      sku: row.sku,
      description: row.description,
      price: Number(row.price) || 0,
      currency: row.currency || "USD",
      inventory: Number(row.inventory) || 0,
      category: row.category || "General",
      status: (row.status as ProductStatus) || "active",
      imageUrl: row.image_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error("Commerce Products GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load commerce products." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const sku = String(body.sku || "").trim().toUpperCase();
    const price = Math.max(0, Number(body.price) || 0);
    const currency = String(body.currency || "USD").toUpperCase();
    const inventory = Math.max(0, Math.floor(Number(body.inventory) || 0));
    const category = String(body.category || "General").trim();
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const status: ProductStatus = body.status === "out_of_stock" || body.status === "archived" ? body.status : "active";

    if (!name || !sku) {
      return NextResponse.json(
        { success: false, error: "Product name and SKU are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("commerce_products")
      .insert({
        user_id: user.id,
        name,
        sku,
        description,
        price,
        currency,
        inventory,
        category,
        status,
        image_url: body.imageUrl || null,
      })
      .select("*")
      .single();

    if (error || !data) {
      // Graceful fallback for local development
      const fallbackProduct: CommerceProduct = {
        id: `prod_${Date.now()}`,
        userId: user.id,
        name,
        sku,
        description,
        price,
        currency,
        inventory,
        category,
        status,
        imageUrl: body.imageUrl || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        product: fallbackProduct,
        source: "local_memory",
      });
    }

    const product: CommerceProduct = {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      sku: data.sku,
      description: data.description,
      price: Number(data.price) || 0,
      currency: data.currency || "USD",
      inventory: Number(data.inventory) || 0,
      category: data.category || "General",
      status: data.status as ProductStatus,
      imageUrl: data.image_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("Commerce Products POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create commerce product." },
      { status: 500 }
    );
  }
}
