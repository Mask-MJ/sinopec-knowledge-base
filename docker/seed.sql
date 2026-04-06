pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: detail: Dept
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers or temporarily dropping the constraints.
pg_dump: hint: Consider using a full dump instead of a --data-only dump to avoid this problem.
pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: detail: Menu
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers or temporarily dropping the constraints.
pg_dump: hint: Consider using a full dump instead of a --data-only dump to avoid this problem.
--
-- PostgreSQL database dump
--

\restrict cbZBXaJokeorEewdX3cerRfhMR8LZJoEwMWNJxHRM0XS3aDPahzo4QF2auxbb6f

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: Dept; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Dept" (id, name, "order", leader, "leaderId", phone, email, "createdAt", "updatedAt", "parentId") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, "isAdmin", "isDeptAdmin", username, password, nickname, avatar, email, "phoneNumber", sex, status, "deptId", "createdAt", "updatedAt", remark) FROM stdin;
1	t	f	admin	$2b$10$kxYSbbQSzJ64r4EIcORm8umQB7GQRLNxWAKHmJalYMzkgRZbAaIDq	管理员				1	t	\N	2026-04-04 09:40:19.725	2026-04-04 09:40:19.725	
2	f	f	user	$2b$10$kxYSbbQSzJ64r4EIcORm8umQB7GQRLNxWAKHmJalYMzkgRZbAaIDq	普通用户				1	t	\N	2026-04-04 09:40:19.726	2026-04-04 09:40:19.726	
\.


--
-- Data for Name: Assistant; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Assistant" (id, name, avatar, description, "modelName", temperature, "topP", "presencePenalty", "frequencyPenalty", "maxTokens", "similarityThreshold", "keywordsSimilarityWeight", "topN", "topK", "emptyResponse", opener, prompt, "assistantId", "createdAt", "updatedAt", "userId", "datasetIds") FROM stdin;
1	E2E测试助手	\N	\N		0.1	0.3	0.4	0.7	512	0.2	0.7	6	1024	\N	\N	\N	78daf9ce301b11f1a9ee0f12e2070f32	2026-04-04 11:43:17.521	2026-04-04 11:43:17.521	1	{}
\.


--
-- Data for Name: Dict; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Dict" (id, name, value, status, "createdAt", "updatedAt", remark) FROM stdin;
1	用户性别	sex	t	2026-04-04 09:40:19.771	2026-04-04 09:40:19.771	
2	状态	status	t	2026-04-04 09:40:19.772	2026-04-04 09:40:19.772	
\.


--
-- Data for Name: DictData; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."DictData" (id, name, value, "order", status, "createdAt", "updatedAt", remark, "dictId") FROM stdin;
1	男	1	1	t	2026-04-04 09:40:19.771	2026-04-04 09:40:19.771		1
2	女	2	2	t	2026-04-04 09:40:19.771	2026-04-04 09:40:19.771		1
3	未知	3	3	t	2026-04-04 09:40:19.771	2026-04-04 09:40:19.771		1
4	启用	1	1	t	2026-04-04 09:40:19.772	2026-04-04 09:40:19.772		2
5	禁用	2	2	t	2026-04-04 09:40:19.772	2026-04-04 09:40:19.772		2
\.


--
-- Data for Name: KnowledgeBase; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."KnowledgeBase" (id, name, avatar, description, "embeddingModel", permission, "chunkMethod", "parserConfig", "datasetId", "order", "createBy", "updateBy", "createdAt", "updatedAt", "deptId") FROM stdin;
2	E2E验证知识库	\N	最终验证	bge-large-zh-v1.5@Xinference	\N	naive	\N	cea8e728300f11f1a9ee0f12e2070f32	1	admin	\N	2026-04-04 10:19:47.512	2026-04-04 10:19:47.512	\N
\.


--
-- Data for Name: LoginLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LoginLog" (id, username, status, ip, address, browser, os, message, "loginTime", "createdAt") FROM stdin;
1	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 09:41:02.366	2026-04-04 09:41:02.366
2	user	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 09:41:24.252	2026-04-04 09:41:24.252
3	admin	f	::ffff:127.0.0.1	内网IP	Other		密码错误	2026-04-04 09:41:24.366	2026-04-04 09:41:24.366
4	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 09:51:42.917	2026-04-04 09:51:42.917
5	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 09:52:28.672	2026-04-04 09:52:28.672
6	user	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 10:02:42.801	2026-04-04 10:02:42.801
7	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 10:19:47.434	2026-04-04 10:19:47.434
8	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 10:20:02.32	2026-04-04 10:20:02.32
9	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 10:29:13.75	2026-04-04 10:29:13.75
10	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 10:32:51.982	2026-04-04 10:32:51.982
11	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 10:33:04.614	2026-04-04 10:33:04.614
12	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 10:33:16.978	2026-04-04 10:33:16.978
13	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 11:42:13.591	2026-04-04 11:42:13.591
14	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 11:43:17.479	2026-04-04 11:43:17.479
15	admin	t	::ffff:127.0.0.1	内网IP	Other			2026-04-04 11:45:18.985	2026-04-04 11:45:18.985
16	admin	f	::1		Chrome	macOS	密码错误	2026-04-04 12:56:08.863	2026-04-04 12:56:08.863
17	admin	t	::1		Chrome	macOS		2026-04-04 12:56:16.981	2026-04-04 12:56:16.981
18	admin	f	::1		Chrome		用户名或密码错误	2026-04-06 03:45:20.276	2026-04-06 03:45:20.276
19	admin	t	::1		Chrome			2026-04-06 03:45:24.371	2026-04-06 03:45:24.371
20	admin	f	::1		Chrome	Linux	用户名或密码错误	2026-04-06 09:45:15.594	2026-04-06 09:45:15.594
21	admin	t	::1		Chrome	Linux		2026-04-06 09:45:57.413	2026-04-06 09:45:57.413
22	admin	t	::1		Chrome			2026-04-06 10:22:18.977	2026-04-06 10:22:18.977
\.


--
-- Data for Name: Menu; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Menu" (id, name, title, path, icon, "activeIcon", type, status, "activePath", "affixTab", "affixTabOrder", badge, "badgeType", "badgeVariants", "hideChildrenInMenu", "hideInBreadcrumb", "hideInMenu", "hideInTab", "iframeSrc", link, "keepAlive", "maxNumOfOpenTabs", "noBasicLayout", "openInNewWindow", query, redirect, permission, "order", "parentId") FROM stdin;
7	创建知识库	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	knowledgeBase:create	1	2
8	修改知识库	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	knowledgeBase:update	1	2
9	删除知识库	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	knowledgeBase:delete	1	2
10	上传文件	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	document:upload	1	2
11	解析文件	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	document:parse	1	2
12	停止解析文件	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	document:stop-parse	1	2
13	修改文件	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	document:update	1	2
14	删除文件	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	document:delete	1	2
15	下载文件	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	document:download	1	2
22	创建聊天	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	assistant:create	1	17
23	修改聊天	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	assistant:update	1	17
24	删除聊天	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	assistant:delete	1	17
25	创建用户	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:user:create	1	19
26	修改用户	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:user:update	1	19
27	删除用户	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:user:delete	1	19
28	强退	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	monitor:online:forceLogout	1	20
31	创建角色	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:role:create	1	29
32	修改角色	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:role:update	1	29
33	删除角色	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:role:delete	1	29
37	创建菜单	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:menu:create	1	35
38	修改菜单	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:menu:update	1	35
39	删除菜单	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:menu:delete	1	35
41	创建字典	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dict:create	1	40
42	修改字典	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dict:update	1	40
43	删除字典	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dict:delete	1	40
44	创建字典数据	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dictData:create	1	40
45	修改字典数据	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dictData:update	1	40
46	删除字典数据	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dictData:delete	1	40
48	创建部门	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dept:create	1	47
49	修改部门	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dept:update	1	47
50	删除部门	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:dept:delete	1	47
52	创建岗位	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:post:create	1	51
53	修改岗位	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:post:update	1	51
54	删除岗位	\N		\N	\N	button	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N	system:post:delete	1	51
1	概览	page.dashboard.title	/dashboard	i-ant-design:appstore-outlined	\N	catalog	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		1	\N
2	知识库	page.knowledgeBase.title	/knowledgeBase	i-ant-design:database-outlined	\N	menu	t	\N	f	0	\N	normal	default	t	f	f	f	\N	\N	f	\N	f	f	\N	\N		2	\N
4	工作台	page.dashboard.workspace	/dashboard/workspace	i-ant-design:laptop-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		2	1
5	通用聊天	page.dashboard.chat	/dashboard/chat	i-ant-design:message-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		3	1
6	知识库详情	page.knowledgeBase.detail.title	/knowledgeBase/detail/:id	i-ant-design:folder-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	t	f	\N	\N	f	\N	f	f	\N	\N		1	2
16	系统管理	page.system.title	/system	i-ant-design:setting-outlined	\N	catalog	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		5	\N
17	聊天助手	page.assistant.title	/assistant	i-ant-design:robot-outlined	\N	menu	t	\N	f	0	\N	normal	default	t	f	f	f	\N	\N	f	\N	f	f	\N	\N		2	\N
18	系统监控	page.monitor.title	/monitor	i-ant-design:android-filled	\N	catalog	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		6	\N
19	用户管理	page.system.user.title	/system/user	i-ant-design:user-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		1	16
20	在线用户	page.monitor.online.title	/monitor/online	i-ant-design:aim-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		1	18
21	聊天	page.assistant.chat.title	/assistant/chat/:id	i-ant-design:message-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	t	f	\N	\N	f	\N	f	f	\N	\N		1	17
29	角色管理	page.system.role.title	/system/role	i-ant-design:usergroup-add-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		2	16
30	登录日志	page.monitor.loginLog.title	/monitor/loginLog	i-ant-design:contacts-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		2	18
34	操作日志	page.monitor.operationLog.title	/monitor/operationLog	i-ant-design:cloud-server-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		3	18
35	菜单管理	page.system.menu.title	/system/menu	i-ant-design:menu-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		3	16
36	服务器监控	page.monitor.info.title	/monitor/info	i-ant-design:fund-projection-screen-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		4	18
40	字典管理	page.system.dict.title	/system/dict	i-ant-design:medicine-box-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		4	16
47	部门管理	page.system.dept.title	/system/dept	i-ant-design:gold-twotone	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		6	16
51	岗位管理	page.system.post.title	/system/post	i-ant-design:deployment-unit-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		7	16
3	分析页	page.dashboard.analytics.title	/dashboard/analytics	i-ant-design:area-chart-outlined	\N	menu	t	\N	f	0	\N	normal	default	f	f	f	f	\N	\N	f	\N	f	f	\N	\N		1	1
\.


--
-- Data for Name: OperationLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OperationLog" (id, "createdAt", title, "businessType", module, username, ip, address) FROM stdin;
1	2026-04-04 10:02:22.376	创建用户: e2etest	1	用户管理			
2	2026-04-04 10:02:22.434	更新用户ID: 4	2	用户管理			
3	2026-04-04 10:02:22.512	管理员重置用户密码, 用户ID: 4	2	用户管理			
4	2026-04-04 10:02:22.531	删除ID为4, 账号为e2etest的用户	2	用户管理	admin	::ffff:127.0.0.1	内网IP
5	2026-04-04 10:05:41.028	删除ID为3, 账号为testuser的用户	2	用户管理	admin	::ffff:127.0.0.1	内网IP
\.


--
-- Data for Name: Post; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Post" (id, code, name, "order", "createdAt", "updatedAt", remark) FROM stdin;
\.


--
-- Data for Name: Role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Role" (id, name, value, "order", status, "createdAt", "updatedAt", remark) FROM stdin;
1	超级管理员	admin	1	t	2026-04-04 09:40:19.709	2026-04-04 09:40:19.709	
2	普通角色	common	2	t	2026-04-04 09:40:19.709	2026-04-04 09:40:19.709	
\.


--
-- Data for Name: _MenuToRole; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."_MenuToRole" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _PostToUser; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."_PostToUser" ("A", "B") FROM stdin;
\.


--
-- Data for Name: _RoleToUser; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."_RoleToUser" ("A", "B") FROM stdin;
1	1
2	2
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
aa9774ff-7eac-449f-8fd5-caad65f25f28	d6b8cd5e401fc55d7519167632072be8bf24ed691043713cb289abe8e4fa0007	2026-04-04 09:39:52.086595+00	20260224095121_init	\N	\N	2026-04-04 09:39:52.025458+00	1
9c148b75-df14-4c79-8329-1a41f92d2726	c50868a9cd678d14ec25ab1df15ade64499aef72033843a50473bf363055ce2a	2026-04-04 09:39:52.095879+00	20260303100508_add_cascade_delete	\N	\N	2026-04-04 09:39:52.087095+00	1
dda2a9cc-8514-4877-8449-2ec29f414663	3a9e5bd6fb8258469cf078482e86b799ac7d60c028dbe1f3d115d36d78cd7020	2026-04-04 12:55:23.019143+00	20260404125523_add_dataset_ids_to_assistant	\N	\N	2026-04-04 12:55:23.015543+00	1
4ba0d8d1-8e8d-4b9a-8d9c-dbe09521eb80	994f28fe55e48c2154cb972ec9c5f99a2cbb2bddb6403f667bfdbe7818a1cad2	2026-04-06 09:47:57.625828+00	20260406160000_prefix_menu_title_with_page	\N	\N	2026-04-06 09:47:57.621351+00	1
\.


--
-- Name: Assistant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Assistant_id_seq"', 1, true);


--
-- Name: Dept_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Dept_id_seq"', 1, false);


--
-- Name: DictData_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."DictData_id_seq"', 5, true);


--
-- Name: Dict_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Dict_id_seq"', 2, true);


--
-- Name: KnowledgeBase_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."KnowledgeBase_id_seq"', 4, true);


--
-- Name: LoginLog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."LoginLog_id_seq"', 22, true);


--
-- Name: Menu_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Menu_id_seq"', 54, true);


--
-- Name: OperationLog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."OperationLog_id_seq"', 5, true);


--
-- Name: Post_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Post_id_seq"', 1, false);


--
-- Name: Role_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Role_id_seq"', 2, true);


--
-- Name: User_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."User_id_seq"', 4, true);


--
-- PostgreSQL database dump complete
--

\unrestrict cbZBXaJokeorEewdX3cerRfhMR8LZJoEwMWNJxHRM0XS3aDPahzo4QF2auxbb6f

