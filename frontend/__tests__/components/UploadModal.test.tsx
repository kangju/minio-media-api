import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import UploadModal from '@/components/UploadModal';

const mockUploadMedia = jest.fn();
const mockAnalyzeMedia = jest.fn();

jest.mock('@/lib/api', () => ({
  uploadMedia: (...args: unknown[]) => mockUploadMedia(...args),
  analyzeMedia: (...args: unknown[]) => mockAnalyzeMedia(...args),
}));

const makeMediaResponse = (id: number, mediaType: 'image' | 'video' = 'image') => ({
  id,
  original_filename: `file${id}.jpg`,
  minio_key: `images/key${id}`,
  media_type: mediaType,
  created_at: new Date().toISOString(),
  deleted_at: null,
  tags: [],
  clip_status: 'pending',
});

function makeFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File(['content'], name, { type });
}

function getUploadButton() {
  return screen.getByRole('button', { name: /^UPLOAD/i });
}

/** アップロードフロー全体の完了を待つ（phase='done' でCLOSEボタン表示） */
async function waitForUploadDone() {
  await waitFor(
    () => expect(screen.getByRole('button', { name: 'CLOSE' })).toBeInTheDocument(),
    { timeout: 3000 }
  );
}

describe('UploadModal', () => {
  let onClose: jest.Mock;
  let onUploaded: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    onClose = jest.fn();
    onUploaded = jest.fn();
  });

  it('ファイル選択後にアップロードボタンが有効になる', () => {
    render(<UploadModal onClose={onClose} onUploaded={onUploaded} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });
    expect(getUploadButton()).not.toBeDisabled();
  });

  it('画像アップロード時に analyzeMedia を呼ばない（バックグラウンドに委ねる）', async () => {
    mockUploadMedia.mockResolvedValue(makeMediaResponse(1, 'image'));
    render(<UploadModal onClose={onClose} onUploaded={onUploaded} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('photo.jpg', 'image/jpeg')] } });

    await act(async () => {
      fireEvent.click(getUploadButton());
    });

    await waitForUploadDone();
    expect(mockUploadMedia).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeMedia).not.toHaveBeenCalled();
  });

  it('動画アップロード時も analyzeMedia を呼ばない', async () => {
    mockUploadMedia.mockResolvedValue(makeMediaResponse(2, 'video'));
    render(<UploadModal onClose={onClose} onUploaded={onUploaded} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile('video.mp4', 'video/mp4')] } });

    await act(async () => {
      fireEvent.click(getUploadButton());
    });

    await waitForUploadDone();
    expect(mockUploadMedia).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeMedia).not.toHaveBeenCalled();
  });

  it('アップロード成功後に onUploaded が呼ばれる', async () => {
    mockUploadMedia.mockResolvedValue(makeMediaResponse(1, 'image'));
    render(<UploadModal onClose={onClose} onUploaded={onUploaded} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await act(async () => {
      fireEvent.click(getUploadButton());
    });

    await waitForUploadDone();
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it('アップロード失敗時にエラーステータスが表示される', async () => {
    mockUploadMedia.mockRejectedValue(new Error('Upload failed'));
    render(<UploadModal onClose={onClose} onUploaded={onUploaded} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await act(async () => {
      fireEvent.click(getUploadButton());
    });

    await waitForUploadDone();
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
    expect(mockAnalyzeMedia).not.toHaveBeenCalled();
  });
});


