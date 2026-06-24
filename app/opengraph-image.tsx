import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Stackt — Plan & track your project updates';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', background: '#1B1A17',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'sans-serif'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 18 }}>
          <div style={{ display: 'flex', width: 300, height: 62, background: '#E58E36', borderRadius: 14 }} />
          <div style={{ display: 'flex', width: 220, height: 62, background: '#4B73F5', borderRadius: 14 }} />
          <div style={{ display: 'flex', width: 160, height: 62, background: '#2CBE3D', borderRadius: 14 }} />
        </div>
        <div style={{ display: 'flex', fontSize: 122, fontWeight: 800, color: '#FFFFFF', marginTop: 46, letterSpacing: -4 }}>
          Stackt
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: '#B7B4AC', marginTop: 12 }}>
          Plan &amp; track your project updates
        </div>
      </div>
    ),
    { ...size }
  );
}
