import { 
	MarkdownView, 
	Notice, 
	Plugin, 
	TFile, 
	MarkdownRenderer, 
	Component, 
	arrayBufferToBase64,
	FileSystemAdapter
} from 'obsidian';

export default class SendNoteToEmailPlugin extends Plugin {

	async onload() {
		// 1. Ribbon Icon
		this.addRibbonIcon('envelope', 'Send current note via email', () => {
			this.sendActiveNote();
		});

		// 2. Command Palette
		this.addCommand({
			id: 'send-current-note-to-email',
			name: 'Send current note via email',
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					if (!checking) {
						this.sendActiveNote();
					}
					return true;
				}
				return false;
			}
		});

		// 3. Context Menu (File Menu)
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Send via Email')
							.setIcon('envelope')
							.onClick(async () => {
								await this.sendNote(file);
							});
					});
				}
			})
		);
	}

	onunload() {
	}

	async sendActiveNote() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file) {
			await this.sendNote(activeView.file);
		} else {
			new Notice('No active note to send.');
		}
	}

	async sendNote(file: TFile) {
		const notice = new Notice('Generating fine-tuned EML draft...', 0);
		try {
			const title = file.basename;
			const content = await this.app.vault.read(file);

			// Render content to HTML
			const tempDiv = document.createElement('div');
			const component = new Component();
			component.load();

			await MarkdownRenderer.render(this.app, content, tempDiv, file.path, component);
			
			// Process Images for EML (Embedded CID)
			const imageEls = tempDiv.querySelectorAll('img');
			const attachments: { filename: string, mimeType: string, base64: string, cid: string }[] = [];
			
			for (let i = 0; i < imageEls.length; i++) {
				const img = imageEls.item(i);
				if (!img) continue;

				const src = img.getAttribute('src');
				const altText = img.getAttribute('alt') || 'image';
				
				if (src && !src.startsWith('http') && !src.startsWith('data:')) {
					// Better path resolution:
					// 1. Decode the src
					const decodedSrc = decodeURIComponent(src);
					// 2. Try to match the filename or the full path
					const fileName = decodedSrc.split('?')[0]?.split('/').pop() || '';
					let imageFile = this.app.metadataCache.getFirstLinkpathDest(fileName, file.path);
					
					// If not found by pop(), try to match the alt text as a fallback (sometimes Obsidian maps alt better)
					if (!imageFile) {
						imageFile = this.app.metadataCache.getFirstLinkpathDest(altText, file.path);
					}

					// If still not found, try a greedy search in the folder relative to active note
					if (!imageFile) {
						const parentFolder = file.parent;
						if (parentFolder) {
							const possibleFiles = parentFolder.children.filter(c => c instanceof TFile && c.name.includes(fileName));
							imageFile = (possibleFiles[0] as TFile) || null;
						}
					}

					if (imageFile instanceof TFile) {
						const buffer = await this.app.vault.readBinary(imageFile);
						const base64 = arrayBufferToBase64(buffer);
						const cid = `img_${i}@obsidian.plugin`; // Formal CID format
						const mimeType = this.getMimeType(imageFile.extension);
						
						attachments.push({
							filename: imageFile.name,
							mimeType: mimeType,
							base64: base64,
							cid: cid
						});
						
						img.setAttribute('src', `cid:${cid}`);
						console.log(`--- DEBUG: Successfully linked cid:${cid} to ${imageFile.path} ---`);
					} else {
						console.log(`--- DEBUG: Failed to solve image source for: ${src} ---`);
					}
				}
			}

			// Generate EML Content
			const boundary = `----=_Boundary_${Date.now()}`;
			const emlSections: string[] = [];

			// Headers
			// Encode Subject if it has non-ASCII characters
			const encodedSubject = this.encodeSubject(title);
			emlSections.push(`Subject: ${encodedSubject}`);
			emlSections.push(`Date: ${new Date().toUTCString()}`);
			emlSections.push(`Message-ID: <${Date.now()}@obsidian.plugin>`);
			emlSections.push(`MIME-Version: 1.0`);
			emlSections.push(`Content-Type: multipart/related; boundary="${boundary}"`);
			emlSections.push(`X-Unsent: 1`);
			emlSections.push(``);

			// HTML Section
			emlSections.push(`--${boundary}`);
			emlSections.push(`Content-Type: text/html; charset="UTF-8"`);
			emlSections.push(`Content-Transfer-Encoding: base64`);
			emlSections.push(``);
			const htmlBody = `<html><body>${tempDiv.innerHTML}</body></html>`;
			const htmlBase64 = this.toBase64(htmlBody);
			emlSections.push(this.wrapText(htmlBase64, 76));
			emlSections.push(``);

			// Attachments Section
			for (const att of attachments) {
				emlSections.push(`--${boundary}`);
				emlSections.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
				emlSections.push(`Content-Transfer-Encoding: base64`);
				emlSections.push(`Content-ID: <${att.cid}>`);
				emlSections.push(`Content-Disposition: inline; filename="${att.filename}"`);
				emlSections.push(``);
				emlSections.push(this.wrapText(att.base64, 76));
				emlSections.push(``);
			}

			emlSections.push(`--${boundary}--`);

			const emlData = emlSections.join('\r\n');

			// Save and Open
			if (this.app.vault.adapter instanceof FileSystemAdapter) {
				const tempFileName = `_email_draft_${Date.now()}.eml`;
				const vaultPath = this.app.vault.adapter.getBasePath();
				const fullPath = `${vaultPath}/${tempFileName}`;
				
				await this.app.vault.adapter.write(tempFileName, emlData);
				const { shell } = require('electron');
				await shell.openPath(fullPath);

				notice.setMessage(`Email Draft populated with ${attachments.length} images!`);
				
				setTimeout(async () => {
					try {
						await this.app.vault.adapter.remove(tempFileName);
					} catch (e) {
						console.warn('Failed to cleanup temp EML file:', e);
					}
				}, 120000); // 2 minutes (longer for large images)
			} else {
				throw new Error('FileSystemAdapter not available');
			}

			notice.hide();
			component.unload();
		} catch (error) {
			console.error('Error preparing fine-tuned EML:', error);
			notice.hide();
			new Notice('Failed to generate high-fidelity email draft.');
		}
	}

	getMimeType(extension: string): string {
		const ext = extension.toLowerCase();
		if (ext === 'png') return 'image/png';
		if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
		if (ext === 'gif') return 'image/gif';
		if (ext === 'webp') return 'image/webp';
		return 'application/octet-stream';
	}

	wrapText(text: string, size: number): string {
		const re = new RegExp(`.{1,${size}}`, 'g');
		return text.match(re)?.join('\r\n') || text;
	}

	toBase64(str: string): string {
		// Robust UTF-8 to Base64
		return btoa(unescape(encodeURIComponent(str)));
	}

	encodeSubject(subject: string): string {
		// If subject has non-ASCII characters, use RFC 2047 encoding
		if (/[^\x00-\x7F]/.test(subject)) {
			return `=?UTF-8?B?${this.toBase64(subject)}?=`;
		}
		return subject;
	}
}
