#!/usr/bin/env python3
"""
Remove white background from GIF and make it transparent
"""
from PIL import Image
import sys
import os

def remove_white_background(input_path, output_path, threshold=240):
    """
    Remove white background from GIF and make it transparent
    threshold: RGB values above this will be considered white (0-255)
    """
    try:
        # Open the GIF
        img = Image.open(input_path)
        
        # Check if it's a GIF
        if img.format != 'GIF':
            print(f"Warning: {input_path} is not a GIF, but {img.format}")
        
        # Convert to RGBA if not already
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Process each frame if animated
        frames = []
        try:
            while True:
                # Get current frame
                frame = img.copy()
                
                # Convert to RGBA if needed
                if frame.mode != 'RGBA':
                    frame = frame.convert('RGBA')
                
                # Get pixel data
                pixels = frame.load()
                width, height = frame.size
                
                # Make white pixels transparent
                for y in range(height):
                    for x in range(width):
                        r, g, b, a = pixels[x, y]
                        # If pixel is white (or near white), make it transparent
                        if r > threshold and g > threshold and b > threshold:
                            pixels[x, y] = (r, g, b, 0)  # Set alpha to 0
                
                frames.append(frame)
                
                # Move to next frame
                img.seek(img.tell() + 1)
        except EOFError:
            pass  # End of frames
        
        # Save as animated GIF
        if len(frames) > 1:
            # Get duration and other info from original
            durations = []
            try:
                img.seek(0)
                while True:
                    durations.append(img.info.get('duration', 100))
                    img.seek(img.tell() + 1)
            except EOFError:
                pass
            
            # Save animated GIF
            frames[0].save(
                output_path,
                save_all=True,
                append_images=frames[1:],
                duration=durations if durations else [100] * len(frames),
                loop=img.info.get('loop', 0),
                transparency=0,
                disposal=2  # Clear to background
            )
        else:
            # Single frame
            frames[0].save(output_path, transparency=0)
        
        print(f"✅ Successfully removed white background from {input_path}")
        print(f"   Saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error processing {input_path}: {e}")
        return False

if __name__ == "__main__":
    input_file = "/Users/kiki/Downloads/corgi-gif-running.gif"
    output_file = "/Users/kiki/Documents/HERODOTUS/ETHGLOBAL_2025/good-old-wallet/extension/public/corgi-running.gif"
    
    if not os.path.exists(input_file):
        print(f"❌ Input file not found: {input_file}")
        sys.exit(1)
    
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    success = remove_white_background(input_file, output_file, threshold=240)
    sys.exit(0 if success else 1)
