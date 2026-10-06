import { describe, expect, it } from 'vitest';
import { versionDocument } from './openInEditor';
import { mockupPlatform } from './designRun';
import type { FreeDesignDocument, FreeDesignWorkspace } from '../desaing/freeDesignDocument';

const doc = (id: string, versions: string[]) => ({ id, canvas: { mounted_assets: versions.map(version_id => ({ asset: { version_id } })) } }) as unknown as FreeDesignDocument;

describe('Crear y editar editor documents', () => {
  it('finds the one saved document of a version, so reopening continues its edits', () => {
    const workspace = { documents: [doc('a', ['v1']), doc('b', ['v2', 'object-2']), doc('c', [])], selected_id: null } as FreeDesignWorkspace;
    expect(versionDocument(workspace, 'v2')?.id).toBe('b');
    expect(versionDocument(workspace, 'v1')?.id).toBe('a');
    expect(versionDocument(workspace, 'v3')).toBeNull();
  });
  it('labels saved mockups with the platforms Xending Design knows', () => {
    expect(mockupPlatform('instagram_story')).toBe('instagram-story');
    expect(mockupPlatform('linkedin_landscape')).toBe('linkedin-post');
    expect(mockupPlatform('linkedin_personal_cover')).toBe('linkedin-personal-cover');
  });
});
