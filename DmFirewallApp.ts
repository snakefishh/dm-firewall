import {
    IAppAccessors,
    IHttp,
    IPersistence,
    IRead,
    ILogger,
    IConfigurationExtend,
    IEnvironmentRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { IPreRoomCreatePrevent } from '@rocket.chat/apps-engine/definition/rooms/IPreRoomCreatePrevent';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms/IRoom';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms/RoomType';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings/SettingType';
import { ISetting } from '@rocket.chat/apps-engine/definition/settings';
import { IConfigurationModify } from '@rocket.chat/apps-engine/definition/accessors';

/**
 * Приложение для защиты пользователя от нежелательных личных сообщений.
 *
 * Логика работы:
 * - При попытке создать личную комнату (DM) проверяется, есть ли в ней защищённый пользователь
 * - Если есть, то инициатор создания должен состоять в указанном канале
 * - Если инициатор не состоит в канале — создание DM блокируется
 *
 * Оптимизация:
 * - ID защищённого пользователя кэшируется в памяти приложения
 * - Чтение из БД происходит только один раз (при первом вызове или после изменения настройки)
 */
export class AppkaApp extends App implements IPreRoomCreatePrevent {
    /**
     * Кэш ID защищённого пользователя.
     * null = нужно обновить кэш (первый запуск или изменение настройки)
     */
    private protectedUserId: string | null = null;

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    /**
     * Регистрация настроек приложения при инициализации.
     *
     * @param configuration - интерфейс для расширения конфигурации
     * @param environmentRead - интерфейс для чтения окружения
     */
    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        // Настройка: имя защищённого пользователя
        await configuration.settings.provideSetting({
            id: 'protectedUser',
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            hidden: false,
            section: 'DM Protection',
            i18nLabel: 'protectedUser',
            i18nDescription: 'protectedUser_Desc',
        });

        // Настройка: имя канала, участники которого могут писать защищённому пользователю
        await configuration.settings.provideSetting({
            id: 'allowedRoom',
            type: SettingType.STRING,
            packageValue: '',
            required: false,
            public: false,
            hidden: false,
            section: 'DM Protection',
            i18nLabel: 'allowedRoom',
            i18nDescription: 'allowedRoom_Desc',
        });
    }

    /**
     * Обработчик изменения настроек приложения.
     * Вызывается автоматически при изменении любой настройки в админ-панели.
     *
     * @param setting - изменённая настройка
     * @param configurationModify - интерфейс для изменения конфигурации
     * @param read - интерфейс для чтения данных
     * @param http - интерфейс для HTTP-запросов
     */
    public async onSettingUpdated(setting: ISetting, configurationModify: IConfigurationModify, read: IRead, http: IHttp): Promise<void> {
        // Если изменилась настройка 'protectedUser' — сбрасываем кэш ID
        if (setting.id === 'protectedUser') {
            this.protectedUserId = null;
        }
    }

    /**
     * Опциональный метод для быстрой проверки, нужно ли запускать основной обработчик.
     * Возвращает true только для личных сообщений (DM), чтобы не проверять другие типы комнат.
     *
     * @param room - создаваемая комната
     * @param read - интерфейс для чтения данных
     * @param http - интерфейс для HTTP-запросов
     * @returns true, если нужно проверить комнату (только для DM)
     */
    public async checkPreRoomCreatePrevent(room: IRoom, read: IRead, http: IHttp): Promise<boolean> {
        // Проверяем только личные сообщения
        if (room.type !== RoomType.DIRECT_MESSAGE) {
            return false;
        }

        // Кэшируем ID защищённого пользователя (один раз при старте или после сброса)
        if (this.protectedUserId === null) {
            // 1. Читаем username из настройки
            const username = await read.getEnvironmentReader().getSettings().getValueById('protectedUser');

            // Если username не настроен — пропускаем
            if (!username || typeof username !== 'string' || username.trim() === '') {
                return false;
            }

            // 2. Получаем ID по username
            try {
                const user = await read.getUserReader().getByUsername(username.trim());
                this.protectedUserId = user?.id ?? null;
            } catch (e) {
                // При ошибке оставляем null
                this.protectedUserId = null;
            }
        }

        // Если ID не получен (пользователь не найден) — пропускаем
        if (!this.protectedUserId) {
            return false;
        }

        // 3. Проверяем наличие ID защищённого пользователя в комнате (быстро, без БД)
        return room.userIds?.includes(this.protectedUserId) ?? false;
    }

    /**
     * Основной метод для предотвращения создания личных сообщений.
     * Вызывается только если checkPreRoomCreatePrevent вернул true.
     *
     * @param room - создаваемая комната
     * @param read - интерфейс для чтения данных
     * @param http - интерфейс для HTTP-запросов
     * @param persistence - интерфейс для работы с хранилищем
     * @returns true для блокировки создания комнаты, false для разрешения
     */
    public async executePreRoomCreatePrevent(
        room: IRoom,
        read: IRead,
        http: IHttp,
        persistence: IPersistence
    ): Promise<boolean> {
        // ============================================================
        // Шаг 1: Получение настройки канала
        // ============================================================
        const allowedRoomSetting = await read.getEnvironmentReader().getSettings().getValueById('allowedRoom');

        // Получаем имя разрешённого канала (без # в начале, если есть)
        let allowedRoomName = allowedRoomSetting && typeof allowedRoomSetting === 'string'
            ? allowedRoomSetting.trim()
            : '';

        if (allowedRoomName.startsWith('#')) {
            allowedRoomName = allowedRoomName.substring(1);
        }

        // Если канал не указан — блокируем всех (защита активна)
        if (!allowedRoomName) {
            return true;
        }

        // ============================================================
        // Шаг 2: Получение ID инициатора
        // ============================================================
        // Инициатор — это тот, кто не является защищённым пользователем
        // Используем кэшированный ID для исключения защищённого пользователя
        const userIds = room.userIds || [];
        const initiatorUserId = userIds.find(id => id !== this.protectedUserId);

        if (!initiatorUserId) {
            return false;
        }

        // ============================================================
        // Шаг 3: Проверка членства инициатора в разрешённом канале
        // ============================================================
        let isInitiatorAllowed = false;

        try {
            // Получаем канал по имени
            const allowedRoom = await read.getRoomReader().getByName(allowedRoomName);

            if (allowedRoom) {
                // Получаем список всех участников канала
                const channelMembers = await read.getRoomReader().getMembers(allowedRoom.id);

                // Проверяем, состоит ли инициатор в канале (по ID, без лишних запросов)
                isInitiatorAllowed = channelMembers.some(member => member.id === initiatorUserId);
            }
        } catch (e) {
            // При ошибке проверки канала оставляем isInitiatorAllowed = false
        }

        // ============================================================
        // Шаг 5: Принятие решения о блокировке
        // ============================================================
        // Блокируем создание DM, если инициатор не состоит в разрешённом канале
        if (!isInitiatorAllowed) {
            return true; // Заблокировать
        }

        return false; // Разрешить
    }
}
