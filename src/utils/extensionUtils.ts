import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function getExtensionVersion(): string {
    const extension = vscode.extensions.getExtension('visbal.visbal-ext');
    if (extension) {
        return extension.packageJSON.version;
    }
    return 'unknown';
}
