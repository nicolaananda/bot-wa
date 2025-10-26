#!/usr/bin/env python3
"""
WhatsApp Bot Product Image Generator
Creates attractive product images for portfolio
"""

import os
from PIL import Image, ImageDraw, ImageFont
import textwrap

def create_product_image(title, price, features, product_type="game"):
    """Create a product image with attractive design"""
    
    # Image dimensions
    width, height = 400, 600
    
    # Create image with gradient background
    img = Image.new('RGB', (width, height), color='#1a1a2e')
    draw = ImageDraw.Draw(img)
    
    # Draw gradient background
    for i in range(height):
        color_value = int(26 + (i / height) * 50)  # Gradient from dark blue to lighter
        draw.line([(0, i), (width, i)], fill=(color_value, color_value, 100))
    
    # Try to use a font, fallback to default if not available
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        price_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 32)
        feature_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 16)
    except:
        title_font = ImageFont.load_default()
        price_font = ImageFont.load_default()
        feature_font = ImageFont.load_default()
    
    # Draw title
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_width = title_bbox[2] - title_bbox[0]
    draw.text(((width - title_width) // 2, 50), title, fill='#ffffff', font=title_font)
    
    # Draw price
    price_text = f"Rp {price:,}"
    price_bbox = draw.textbbox((0, 0), price_text, font=price_font)
    price_width = price_bbox[2] - price_bbox[0]
    draw.text(((width - price_width) // 2, 100), price_text, fill='#00ff88', font=price_font)
    
    # Draw features
    y_pos = 200
    for feature in features:
        draw.text((50, y_pos), f"✅ {feature}", fill='#ffffff', font=feature_font)
        y_pos += 30
    
    # Draw product type icon
    if product_type == "game":
        draw.text((50, 450), "🎮", font=ImageFont.load_default())
    elif product_type == "app":
        draw.text((50, 450), "📱", font=ImageFont.load_default())
    elif product_type == "voucher":
        draw.text((50, 450), "💳", font=ImageFont.load_default())
    
    # Draw order instructions
    draw.text((50, 500), "📱 Order: .buy [id] [qty]", fill='#ffff00', font=feature_font)
    draw.text((50, 530), "💳 QRIS: .buynow [id] [qty]", fill='#ffff00', font=feature_font)
    
    return img

def create_qris_image(amount, code):
    """Create QRIS payment image"""
    
    width, height = 400, 500
    img = Image.new('RGB', (width, height), color='#ffffff')
    draw = ImageDraw.Draw(img)
    
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        amount_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 32)
        code_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 20)
    except:
        title_font = ImageFont.load_default()
        amount_font = ImageFont.load_default()
        code_font = ImageFont.load_default()
    
    # Draw header
    draw.text((50, 30), "💳 QRIS PAYMENT", fill='#000000', font=title_font)
    
    # Draw amount
    amount_text = f"Rp {amount:,}"
    amount_bbox = draw.textbbox((0, 0), amount_text, font=amount_font)
    amount_width = amount_bbox[2] - amount_bbox[0]
    draw.text(((width - amount_width) // 2, 80), amount_text, fill='#0066cc', font=amount_font)
    
    # Draw QR code placeholder
    qr_size = 200
    qr_x = (width - qr_size) // 2
    qr_y = 150
    
    # Draw QR code border
    draw.rectangle([qr_x, qr_y, qr_x + qr_size, qr_y + qr_size], 
                   outline='#000000', width=3)
    
    # Draw QR code pattern (simplified)
    for i in range(0, qr_size, 20):
        for j in range(0, qr_size, 20):
            if (i + j) % 40 == 0:
                draw.rectangle([qr_x + i, qr_y + j, qr_x + i + 15, qr_y + j + 15], 
                               fill='#000000')
    
    # Draw code
    draw.text((50, 370), f"🔢 Code: {code}", fill='#000000', font=code_font)
    draw.text((50, 400), "⏰ Expires: 30 minutes", fill='#ff6600', font=code_font)
    
    # Draw instructions
    draw.text((50, 430), "📱 Scan with payment app", fill='#666666', font=code_font)
    draw.text((50, 460), "• GoPay, OVO, DANA, LinkAja", fill='#666666', font=code_font)
    
    return img

def create_dashboard_image():
    """Create dashboard mockup image"""
    
    width, height = 800, 600
    img = Image.new('RGB', (width, height), color='#f0f0f0')
    draw = ImageDraw.Draw(img)
    
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        metric_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 18)
        small_font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 14)
    except:
        title_font = ImageFont.load_default()
        metric_font = ImageFont.load_default()
        small_font = ImageFont.load_default()
    
    # Draw header
    draw.rectangle([0, 0, width, 60], fill='#2c3e50')
    draw.text((20, 20), "📊 BUSINESS ANALYTICS DASHBOARD", fill='#ffffff', font=title_font)
    
    # Draw metrics boxes
    metrics = [
        ("💰 Revenue Today", "Rp 2,450,000", "#27ae60"),
        ("📦 Orders", "156 transactions", "#3498db"),
        ("👥 Active Users", "89 users", "#e74c3c"),
        ("⚡ Response Time", "67ms avg", "#f39c12")
    ]
    
    box_width = 180
    box_height = 100
    margin = 20
    
    for i, (label, value, color) in enumerate(metrics):
        x = margin + (i % 2) * (box_width + margin)
        y = 80 + (i // 2) * (box_height + margin)
        
        # Draw metric box
        draw.rectangle([x, y, x + box_width, y + box_height], 
                      fill=color, outline='#000000', width=2)
        
        # Draw label
        draw.text((x + 10, y + 10), label, fill='#ffffff', font=small_font)
        
        # Draw value
        draw.text((x + 10, y + 40), value, fill='#ffffff', font=metric_font)
    
    # Draw chart area
    chart_y = 300
    draw.rectangle([margin, chart_y, width - margin, chart_y + 200], 
                  fill='#ffffff', outline='#000000', width=2)
    
    draw.text((margin + 10, chart_y + 10), "📊 Sales Chart", fill='#000000', font=metric_font)
    
    # Draw simple chart
    chart_data = [45, 32, 28, 35, 42, 38, 45]
    chart_width = width - 2 * margin - 40
    chart_height = 150
    chart_x = margin + 20
    chart_y += 40
    
    max_value = max(chart_data)
    
    for i, value in enumerate(chart_data):
        bar_width = chart_width // len(chart_data) - 5
        bar_height = int((value / max_value) * chart_height)
        bar_x = chart_x + i * (bar_width + 5)
        bar_y = chart_y + chart_height - bar_height
        
        draw.rectangle([bar_x, bar_y, bar_x + bar_width, chart_y + chart_height], 
                      fill='#3498db')
    
    # Draw top products
    products_y = chart_y + 200
    draw.text((margin + 10, products_y), "🔥 Top Products:", fill='#000000', font=metric_font)
    
    products = [
        "1. Game Account - 45 sales",
        "2. App Subscription - 32 sales", 
        "3. Digital Voucher - 28 sales"
    ]
    
    for i, product in enumerate(products):
        draw.text((margin + 10, products_y + 30 + i * 25), product, 
                 fill='#000000', font=small_font)
    
    return img

def main():
    """Generate all product images"""
    
    # Create products directory
    os.makedirs('screenshots/products', exist_ok=True)
    os.makedirs('screenshots/dashboard', exist_ok=True)
    os.makedirs('screenshots/interface', exist_ok=True)
    
    # Product 1: Game Account
    game_img = create_product_image(
        "🎮 PREMIUM GAME ACCOUNT",
        25000,
        ["Mythic Rank", "50+ Heroes", "Instant Delivery", "24/7 Support"],
        "game"
    )
    game_img.save('screenshots/products/game-account.png')
    
    # Product 2: App Subscription
    app_img = create_product_image(
        "📱 PREMIUM APP SUBSCRIPTION",
        15000,
        ["Spotify Premium", "1 Month Duration", "Ad-free Music", "Offline Access"],
        "app"
    )
    app_img.save('screenshots/products/app-subscription.png')
    
    # Product 3: Digital Voucher
    voucher_img = create_product_image(
        "💳 DIGITAL VOUCHER",
        45000,
        ["Tokopedia Voucher", "Rp 50,000 Value", "30 Days Valid", "Multiple Use"],
        "voucher"
    )
    voucher_img.save('screenshots/products/digital-voucher.png')
    
    # QRIS Payment Image
    qris_img = create_qris_image(25000, 42)
    qris_img.save('screenshots/interface/qris-payment.png')
    
    # Dashboard Image
    dashboard_img = create_dashboard_image()
    dashboard_img.save('screenshots/dashboard/analytics-dashboard.png')
    
    print("✅ All product images generated successfully!")
    print("📁 Images saved in screenshots/ directory")

if __name__ == "__main__":
    main()
