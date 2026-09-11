// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}));
vi.mock('next-themes',()=>({useTheme:()=>({theme:'light',setTheme:vi.fn()})}));
vi.mock('../lib/auth-actions',()=>({signOut:vi.fn()}));
vi.mock('../components/chat-markdown',()=>({ChatMarkdown:()=>null}));
vi.mock('../components/credits-panel',()=>({WalletLink:()=>null}));
import {ChatShell} from '../components/chat-shell';
let root:Root;let node:HTMLDivElement;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 Element.prototype.scrollIntoView=vi.fn();
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){} unobserve(){}});
 node=document.createElement('div');document.body.append(node);root=createRoot(node);
});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();});
it.each(['UNSUPPORTED_BILLING_MODALITY','INSUFFICIENT_CREDITS','OTHER'])('renders the actual send failure recovery for %s',async code=>{
 vi.stubGlobal('fetch',vi.fn(async (url:string)=> url.startsWith('/api/chats')?Response.json([]):Response.json({code,message:'Original failure'},{status:400})));
 await act(async()=>root.render(<ChatShell initialViewer={{isAuthenticated:true,id:'u',email:'u@example.test',name:'User',avatarUrl:null}}/>));
 const input=node.querySelector('textarea')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'hello');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>node.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const alert=node.querySelector('[role="alert"]'); expect(alert).not.toBeNull();
 if(code==='UNSUPPORTED_BILLING_MODALITY') {
   expect(alert?.textContent).toContain('Start a new text-only conversation');
   await act(async()=>alert!.querySelector('button')!.click());
   expect(node.querySelector('[role="alert"]')).toBeNull();
 } else if(code==='INSUFFICIENT_CREDITS') expect(alert?.querySelector('a')?.getAttribute('href')).toBe('/credits');
 else {expect(alert?.textContent).toContain('Original failure');expect(alert?.querySelector('a')).toBeNull();}
});
