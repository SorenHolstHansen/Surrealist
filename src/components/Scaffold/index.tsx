import classes from './style.module.scss';
import surrealistLogo from '~/assets/icon.png';
import { ActionIcon, Badge, Box, Button, Center, clsx, Group, Image, Modal, NavLink, Paper, Popover, Select, SimpleGrid, Stack, Text, TextInput, Title, useMantineTheme, PasswordInput } from '@mantine/core';
import { Spacer } from "../Spacer";
import { actions, store, useStoreValue } from '~/store';
import { useStable } from '~/hooks/stable';
import { uid } from 'radash';
import { MouseEvent, PropsWithChildren, useEffect, useState } from 'react';
import { mod, showError, updateConfig, updateTitle } from '~/util/helpers';
import { TabBar } from '../TabBar';
import { Form } from '../Form';
import { useImmer } from 'use-immer';
import { getSurreal, openSurreal, SurrealConnection } from '~/surreal';
import { useActiveTab, useTabCreator } from '~/hooks/tab';
import { showNotification } from '@mantine/notifications';
import { useIsLight } from '~/hooks/theme';
import { mdiClose, mdiConsole, mdiDelete, mdiPlus } from '@mdi/js';
import { Icon } from '../Icon';
import { Splitter } from '../Splitter';
import { ConsolePane } from '../ConsolePane';
import { QueryView } from '~/views/query/QueryView';
import { ExplorerView } from '~/views/explorer/ExplorerView';
import { AuthMode, ViewMode } from '~/typings';
import { VisualizerView } from '~/views/visualizer/VisualizerView';
import { useHotkeys } from '@mantine/hooks';
import { AUTH_MODES, VIEW_MODES } from '~/constants';
import { DesignerView } from '~/views/designer/DesignerView';
import { AuthenticationView } from '~/views/authentication/AuthenticationView';
import { adapter } from '~/adapter';
import { DesktopAdapter } from '~/adapter/desktop';
import { fetchDatabaseSchema } from '~/util/schema';

function ViewSlot(props: PropsWithChildren<{ visible: boolean }>) {
	return (
		<div style={{ display: props.visible ? 'initial' : 'none' }}>
			{props.children}
		</div>
	)
}

export function Scaffold() {
	const isLight = useIsLight();
	const theme = useMantineTheme();
	const activeTab = useStoreValue(state => state.config.activeTab);
	const autoConnect = useStoreValue(state => state.config.autoConnect);
	const servePending = useStoreValue(state => state.servePending);
	const isServing = useStoreValue(state => state.isServing);
	const enableConsole = useStoreValue(state => state.config.enableConsole);
	const isConnected = useStoreValue(state => state.isConnected);
	const createTab = useTabCreator();
	const tabInfo = useActiveTab();

	const [isConnecting, setIsConnecting] = useState(false);
	const [isViewListing, setIsViewListing] = useState(false);

	const createNewTab = useStable(() => {
		const tabId = createTab('New tab');

		store.dispatch(actions.setActiveTab(tabId));

		updateTitle();
		updateConfig();
	});

	const [ editingInfo, setEditingInfo ] = useState(false);
	const [ infoDetails, setInfoDetails ] = useImmer<SurrealConnection>({
		endpoint: '',
		namespace: '',
		database: '',
		username: '',
		password: '',
		authMode: 'root',
		scope: '',
		scopeFields: []
	});

	const [ editingScope, setEditingScope ] = useState(false);

	const openInfoEditor = useStable(() => {
		setEditingInfo(true);
		setInfoDetails(tabInfo!.connection);
	});

	const closeEditingInfo = useStable(() => {
		setEditingInfo(false);
	});

	const openScopeEditor = useStable(() => {
		setEditingScope(true);
	});

	const closeEditingScope = useStable(() => {
		setEditingScope(false);
	});

	const addScopeField = useStable(() => {
		setInfoDetails(draft => {
			draft.scopeFields.push({
				subject: '',
				value: ''
			});
		});
	});

	const setIsConnected = useStable((value: boolean) => {
		store.dispatch(actions.setIsConnected(value));
	});

	const openConnection = useStable((e?: MouseEvent, silent?: boolean) => {
		e?.stopPropagation();

		if (isConnecting) {
			return;
		}

		const tabInfo = store.getState().config.tabs.find(tab => tab.id === activeTab);

		if (!tabInfo) {
			return;
		}

		try {
			openSurreal({
				connection: tabInfo.connection,
				onConnect() {
					setIsConnecting(false);
					setIsConnected(true);
					fetchDatabaseSchema();
				},
				onDisconnect(code, reason) {
					setIsConnecting(false);
					setIsConnected(false);

					if (code != 1000 && !silent) {
						const subtitle = code === 1006
							? 'Unexpected connection close'
							: reason || `Unknown reason`;

						showNotification({
							disallowClose: true,
							color: 'red.4',
							bg: 'red.6',
							message: (
								<div>
									<Text color="white" weight={600}>Connection Closed</Text>
									<Text color="white" opacity={0.8} size="sm">{subtitle} ({code})</Text>
								</div>
							)
						});
					}
				}
			});

			setIsConnecting(true);
		} catch(err: any) {
			showError('Failed to open connection', err.message);
		}
	});

	const sendQuery = useStable(async (override?: string) => {
		if (tabInfo?.activeView !== 'query') {
			return;
		}

		if (!isConnected) {
			showNotification({
				message: 'You must be connected to send a query',
			});
			return;
		}

		const { query, name } = tabInfo!;
		const variables = tabInfo!.variables ? JSON.parse(tabInfo!.variables) : undefined;

		try {
			const response = await getSurreal()?.query(override?.trim() || query, variables);

			store.dispatch(actions.updateTab({
				id: activeTab!,
				lastResponse: response
			}));
		} catch(err: any) {
			store.dispatch(actions.updateTab({
				id: activeTab!,
				lastResponse: [{
					status: 'ERR',
					detail: err.message
				}]
			}));
		}

		store.dispatch(actions.addHistoryEntry({
			id: uid(5),
			query: query,
			tabName: name,
			timestamp: Date.now()
		}));

		await updateConfig();
	});

	const saveInfo = useStable(async () => {
		store.dispatch(actions.updateTab({
			id: activeTab!,
			connection: {
				...infoDetails
			}
		}));

		if (isConnected) {
			getSurreal()?.close();
		}

		await updateConfig();
		closeEditingInfo();

		if (autoConnect) {
			openConnection();
		}
	});

	const closeConnection = useStable((e?: MouseEvent) => {
		e?.stopPropagation();
		getSurreal()?.close();
		setIsConnecting(false);
		setIsConnected(false);
	});

	const setViewMode = useStable((id: ViewMode) => {
		setIsViewListing(false);

		store.dispatch(actions.updateTab({
			id: activeTab!,
			activeView: id
		}));

		updateConfig();
		updateTitle();
	});

	useEffect(() => {
		if (autoConnect) {
			openConnection(undefined, true);
		}
	}, [autoConnect, activeTab]);

	const revealConsole = useStable((e: MouseEvent) => {
		e.stopPropagation();
		store.dispatch(actions.setConsoleEnabled(true));
	});

	const connectionSaveDisabled = !infoDetails.endpoint || !infoDetails.namespace || !infoDetails.database || !infoDetails.username || !infoDetails.password;
	const showConsole = enableConsole && (servePending || isServing);
	const borderColor = theme.fn.themeColor(isConnected ? 'surreal' : 'light');
	const viewMode = tabInfo?.activeView || 'query';
	const viewInfo = VIEW_MODES.find(v => v.id == viewMode)!;
	const isDesktop = adapter instanceof DesktopAdapter;

	const handleSendQuery = useStable((e: MouseEvent) => {
		e.stopPropagation();
		sendQuery();
	});

	const relativeViewMode = useStable((value: number) => {
		let available = VIEW_MODES;

		if (!(adapter instanceof DesktopAdapter)) {
			available = available.filter((v: any) => !v.desktop) as any;
		}

		const current = available.findIndex((v: any) => v.id == viewMode);
		const next = mod(current + value, available.length);

		setViewMode(VIEW_MODES[next].id);
	});

	useHotkeys([
		['ctrl+arrowLeft', () => {
			relativeViewMode(-1);
		}],
		['ctrl+arrowRight', () => {
			relativeViewMode(1);
		}],
	], []);

	useHotkeys([
		['F9', () => sendQuery()],
		['mod+Enter', () => sendQuery()],
	]);

	return (
		<div className={classes.root}>
			<TabBar
				viewMode={viewMode}
				openConnection={openConnection}
				closeConnection={closeConnection}
				onCreateTab={createNewTab}
				onSwitchTab={closeConnection}
			/>

			{activeTab ? (
				<>
					<Group p="xs">
						<Popover
							opened={isViewListing}
							onChange={setIsViewListing}
							position="bottom-start"
							exitTransitionDuration={75}
							closeOnEscape
							shadow="lg"
							withArrow
						>
							<Popover.Target>
								<Button
									px="lg"
									h="100%"
									color="surreal.4"
									variant="gradient"
									title="Select view"
									onClick={() => setIsViewListing(!isViewListing)}
								>
									<Icon
										path={viewInfo.icon}
										left
									/>
									{viewInfo.name}
								</Button>
							</Popover.Target>
							<Popover.Dropdown px="xs">
								<Stack spacing="xs">
									{VIEW_MODES.map(info => {
										const isActive = info.id === viewMode;
										const isDisabled = !isDesktop && info.desktop;

										return (
											<Button
												key={info.id}
												w={264}
												px={0}
												h="unset"
												color={isActive ? 'pink' : 'blue'}
												variant={isActive ? 'light' : 'subtle'}
												className={classes.viewModeButton}
												onClick={() => setViewMode(info.id as ViewMode)}
												bg={isDisabled ? 'transparent !important' : undefined}
												disabled={isDisabled}
											>
												<NavLink
													component="div"
													className={classes.viewModeContent}
													label={info.name}
													icon={
														<Icon color={isDisabled ? 'light.5' : 'surreal'} path={info.icon} />
													}
													description={
														<Stack spacing={6}>
															{info.desc}
															{isDisabled && (
																<div>
																	<Badge color="blue" variant="filled" radius="sm">
																		Surreal Desktop
																	</Badge>
																</div>
															)}
														</Stack>
													}
													styles={{
														label: {
															color: isLight ? 'black' : 'white',
															fontWeight: 600
														},
														description: {
															whiteSpace: 'normal'
														}
													}}
												/>
											</Button>
										)
									})}
								</Stack>
							</Popover.Dropdown>
						</Popover>
						<Group className={classes.inputWrapper}>
							<Paper
								className={clsx(classes.input, (!isConnected || viewMode === 'query') && classes.inputWithButton)}
								onClick={openInfoEditor}
								style={{ borderColor: borderColor }}
							>
								{!isConnected ? (
									<Paper
										bg="light"
										px="xs"
									>
										<Text
											color="white"
											size="xs"
											py={2}
											weight={600}
										>
											OFFLINE
										</Text>
									</Paper>
								) : tabInfo!.connection.authMode == 'none' ? (
									<Paper
										bg={isLight ? 'light.0' : 'light.6'}
										c={isLight ? 'light.4' : 'light.3'}
										fs="italic"
										px="xs"
									>
										Anon
									</Paper>
								) : tabInfo!.connection.authMode == 'scope' ? (
									<Paper
										bg={isLight ? 'light.0' : 'light.6'}
										c={isLight ? 'light.4' : 'light.3'}
										fs="italic"
										px="xs"
									>
										{tabInfo!.connection.scope}
									</Paper>
								) :(
									<Paper
										bg={isLight ? 'light.0' : 'light.6'}
										c={isLight ? 'light.6' : 'white'}
										px="xs"
									>
										{tabInfo!.connection.username}
									</Paper>
								)}
								<Text color={isLight ? 'light.6' : 'white'}>
									{tabInfo!.connection.endpoint}
								</Text>
								<Spacer />
								{(servePending || isServing) && !showConsole && (
									<ActionIcon
										onClick={revealConsole}
										title="Reveal console"
									>
										<Icon color="light.4" path={mdiConsole} />
									</ActionIcon>
								)}
								{isConnected && (
									<ActionIcon
										onClick={closeConnection}
										title="Disconnect"
									>
										<Icon color="light.4" path={mdiClose} />
									</ActionIcon>
								)}
							</Paper>
							{!isConnected ? (
								<Button
									color="light"
									className={classes.sendButton}
									onClick={openConnection}
								>
									{isConnecting ? 'Connecting...' : 'Connect'}
								</Button>
							) : viewMode == 'query' && (
								<Button
									color="surreal"
									onClick={handleSendQuery}
									className={classes.sendButton}
									title="Send Query (F9)"
								>
									Send Query
								</Button>
							)}
						</Group>
					</Group>

					<Box p="xs" className={classes.content}>
						<Splitter
							minSize={100}
							bufferSize={53}
							direction="vertical"
							endPane={showConsole && (
								<ConsolePane />
							)}
						>
							<ViewSlot visible={viewMode == 'query'}>
								<QueryView
									sendQuery={sendQuery}
								/>
							</ViewSlot>

							<ViewSlot visible={viewMode == 'explorer'}>
								<ExplorerView />
							</ViewSlot>

							<ViewSlot visible={viewMode == 'visualizer'}>
								<VisualizerView />
							</ViewSlot>

							{isDesktop && (
								<ViewSlot visible={viewMode == 'designer'}>
									<DesignerView />
								</ViewSlot>
							)}

							{isDesktop && (
								<ViewSlot visible={viewMode == 'auth'}>
									<AuthenticationView />
								</ViewSlot>
							)}
						</Splitter>
					</Box>
				</>
			) : (
				<Center h="100%">
					<div>
						<Image
							className={classes.emptyImage}
							src={surrealistLogo}
							width={120}
							mx="auto"
						/>
						<Title color="light" align="center" mt="md">
							Surrealist
						</Title>
						<Text color="light.2" align="center">
							Open or create a new tab to continue
						</Text>
						<Center mt="lg">
							<Button size="xs" onClick={createNewTab}>
								Create tab
							</Button>
						</Center>
					</div>
				</Center>
			)}

			{/* ANCHOR Connection details modal */}
			<Modal
				opened={editingInfo}
				onClose={closeEditingInfo}
				size="lg"
				title={
					<Title size={16} color={isLight ? 'light.6' : 'white'}>
						Connection details
					</Title>
				}
			>
				<Form onSubmit={saveInfo}>
					<SimpleGrid cols={2} spacing="xl">
						<Stack>
							<TextInput
								required
								label="Endpoint URL"
								value={infoDetails.endpoint}
								onChange={(e) => setInfoDetails(draft => {
									draft.endpoint = e.target.value
								})}
								autoFocus
							/>
							<TextInput
								required
								label="Namespace"
								value={infoDetails.namespace}
								onChange={(e) => setInfoDetails(draft => {
									draft.namespace = e.target.value
								})}
							/>
							<TextInput
								required
								label="Database"
								value={infoDetails.database}
								onChange={(e) => setInfoDetails(draft => {
									draft.database = e.target.value
								})}
							/>
						</Stack>
						<Stack>
							<Select
								label="Authentication mode"
								value={infoDetails.authMode}
								onChange={(value) => setInfoDetails(draft => {
									draft.authMode = value as AuthMode;
								})}
								data={AUTH_MODES}
							/>
							{infoDetails.authMode !== 'scope' && infoDetails.authMode !== 'none' && (
								<>
									<TextInput
										required
										label="Username"
										value={infoDetails.username}
										onChange={(e) => setInfoDetails(draft => {
											draft.username = e.target.value
										})}
									/>
									<PasswordInput
										required
										label="Password"
										value={infoDetails.password}
										onChange={(e) => setInfoDetails(draft => {
											draft.password = e.target.value
										})}
									/>
								</>
							)}
							
							{infoDetails.authMode === 'scope' && (
								<>
									<TextInput
										required
										label="Scope"
										value={infoDetails.scope}
										onChange={(e) => setInfoDetails(draft => {
											draft.scope = e.target.value
										})}
									/>
									<Button
										mt={21}
										color="blue"
										variant="outline"
										onClick={openScopeEditor}
									>
										Edit scope data
									</Button>
								</>
							)}
						</Stack>
					</SimpleGrid>
					<Group mt="lg">
						<Button
							color={isLight ? 'light.5' : 'light.3'}
							variant="light"
							onClick={closeEditingInfo}
						>
							Close
						</Button>
						<Spacer />
						<Button
							disabled={connectionSaveDisabled}
							type="submit"
						>
							Save details
						</Button>
					</Group>
				</Form>
			</Modal>

			{/* ANCHOR Scope data modal */}
			<Modal
				opened={editingScope}
				onClose={closeEditingScope}
				size={560}
				title={
					<Title size={16} color={isLight ? 'light.6' : 'white'}>
						Editing scope data
					</Title>
				}
			>
				{infoDetails.scopeFields.length === 0 ? (
					<Text
						color="gray"
						italic
					>
						No scope data defined
					</Text>
				) : (
					<Stack>
						{infoDetails.scopeFields.map((field, i) => (
							<Paper key={i}>
								<Group>
									<TextInput
										placeholder="Key"
										style={{ flex: 1 }}
										value={field.subject}
										onChange={(e) => setInfoDetails(draft => {
											draft.scopeFields[i].subject = e.target.value
										})}
									/>
									<TextInput
										placeholder="Value"
										style={{ flex: 1 }}
										value={field.value}
										onChange={(e) => setInfoDetails(draft => {
											draft.scopeFields[i].value = e.target.value
										})}
									/>
									<ActionIcon
										color="red"
										title="Remove field"
										onClick={() => setInfoDetails(draft => {
											draft.scopeFields.splice(i, 1)
										})}
									>
										<Icon
											path={mdiClose}
											color="red"
										/>
									</ActionIcon>
								</Group>
							</Paper>
						))}
					</Stack>
				)}

				<Group mt="lg">
					<Button
						color={isLight ? 'light.5' : 'light.3'}
						variant="light"
						onClick={closeEditingScope}
					>
						Back
					</Button>
					<Spacer />
					<Button
						rightIcon={<Icon path={mdiPlus} />}
						variant="light"
						color="blue"
						onClick={addScopeField}
					>
						Add field
					</Button>
				</Group>
			</Modal>
		</div>
	)
}
