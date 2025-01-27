"""The Task Planner integration."""
import logging
from homeassistant.core import HomeAssistant, callback
from homeassistant.const import CONF_NAME, CONF_ICON, CONF_ID
import homeassistant.helpers.config_validation as cv
from homeassistant.components import input_number, input_boolean, input_text
from homeassistant.components.input_boolean import InputBoolean
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_component import EntityComponent


from .const import (
    DOMAIN,
    CONF_USERS,
    CONF_TASKS,
    CONF_ROLE,
    CONF_DAYS,
    CONF_COLOR,
    CONF_DESCRIPTION,
)

_LOGGER = logging.getLogger(__name__)

class TaskInputBoolean(RestoreEntity):
    """Input boolean that can restore state and attributes."""

    def __init__(self, object_id, config, attributes):
        """Initialize the task input boolean."""
        self._object_id = object_id
        self._attr_name = config.get("name")
        self._attr_icon = config.get("icon")
        self._attr_unique_id = config.get("unique_id")
        self._attr_entity_category = config.get("entity_category")
        self._attr_device_class = config.get("device_class")
        self._attributes = attributes or {}
        self._state = False
        self.entity_id = f"input_boolean.{object_id}"

    @property
    def state(self):
        """Return the state."""
        return "on" if self._state else "off"

    @property
    def extra_state_attributes(self):
        """Return the state attributes."""
        return self._attributes

    async def async_added_to_hass(self):
        """Run when entity about to be added to hass."""
        await super().async_added_to_hass()
        
        last_state = await self.async_get_last_state()
        if last_state:
            self._state = last_state.state == "on"
            if last_state.attributes:
                stored_attrs = dict(last_state.attributes)
                stored_attrs.update(self._attributes)
                self._attributes = stored_attrs

    async def async_turn_on(self, **kwargs):
        """Turn the entity on."""
        self._state = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs):
        """Turn the entity off."""
        self._state = False
        self.async_write_ha_state() 

class TaskEntity(RestoreEntity):
    def __init__(self, hass, user_name, task_name, config, attributes):
        super().__init__()
        self.hass = hass
        self._user_name = user_name
        self._task_name = task_name
        self._config = config
        self._attributes = attributes
        self._state = False
        self._attr_unique_id = f"{DOMAIN}_{self._sanitize_id(user_name)}_{self._sanitize_id(task_name)}"
        self.entity_id = f"task_planner.{self._sanitize_id(user_name)}_{self._sanitize_id(task_name)}"

    @property
    def state(self):
        """Return the state of the entity."""
        return "on" if self._state else "off"

    @property
    def name(self):
        """Return the name of the entity."""
        return f"{self._user_name} - {self._task_name.capitalize()}"
    @property
    def icon(self):
        """Return the icon of the entity."""
        return self._config.get("icon")

    @property
    def extra_state_attributes(self):
        """Return entity specific state attributes."""
        return self._attributes

    @staticmethod
    def _sanitize_id(text):
        """Sanitize text for use in entity ID."""
        if not text:
            return ""
        result = (
            text.lower()
            .replace(" ", "_")
            .replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss")
        )
        return ''.join(c for c in result if c.isalnum() or c == '_')

    async def async_added_to_hass(self):
        """Run when entity about to be added to hass."""
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state:
            self._state = last_state.state == "on"
            if last_state.attributes:
                stored_attrs = dict(last_state.attributes)
                stored_attrs.update(self._attributes)
                self._attributes = stored_attrs

class UserStarsEntity(RestoreEntity):
    def __init__(self, hass, user_name):
        super().__init__()
        self.hass = hass
        self._user_name = user_name
        self._state = 0
        self._attr_unique_id = f"{DOMAIN}_{self._sanitize_id(user_name)}_stars"
        self.entity_id = f"task_planner.{self._sanitize_id(user_name)}_stars"

    @property
    def state(self):
        """Return the state of the entity."""
        return self._state

    @property
    def name(self):
        """Return the name of the entity."""
        return f"{self._user_name} Sterne"

    @property
    def icon(self):
        """Return the icon to use in the frontend."""
        return "mdi:star"

    @staticmethod
    def _sanitize_id(text):
        """Sanitize text for use in entity ID."""
        if not text:
            return ""
        result = (
            text.lower()
            .replace(" ", "_")
            .replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss")
        )
        return ''.join(c for c in result if c.isalnum() or c == '_')

    async def async_added_to_hass(self):
        """Run when entity about to be added to hass."""
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state:
            try:
                self._state = int(last_state.state)
            except ValueError:
                self._state = 0

    async def async_set_value(self, value: int):
        """Set new value."""
        self._state = value
        self.async_write_ha_state()

class UserRoleEntity(RestoreEntity):
    def __init__(self, hass, user_name, role, usericon=None):
        super().__init__()
        self.hass = hass
        self._user_name = user_name
        self._role = role
        self._usericon = usericon or "mdi:account"
        self._attr_unique_id = f"{DOMAIN}_{self._sanitize_id(user_name)}_role"
        self.entity_id = f"task_planner.{self._sanitize_id(user_name)}_role"
        
    @property
    def state(self):
        return self._role

    @property
    def name(self):
        return f"{self._user_name} Rolle"

    @property
    def icon(self):
        return self._usericon

    @staticmethod
    def _sanitize_id(text):
        if not text:
            return ""
        result = (text.lower()
            .replace(" ", "_")
            .replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss"))
        return ''.join(c for c in result if c.isalnum() or c == '_')

    async def async_added_to_hass(self):
        await super().async_added_to_hass()
        last_state = await self.async_get_last_state()
        if last_state:
            self._role = last_state.state
            
def create_task_entity(entity_id, config, attributes):
    """Create a new task entity."""
    return TaskInputBoolean(entity_id, config, attributes)

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Task Planner component."""
    if DOMAIN not in config:
        return True

    # Initialize the domain data before adding entities
    if DOMAIN not in hass.data:
        hass.data[DOMAIN] = {}

    # Create an EntityComponent for our custom entities
    component = EntityComponent(_LOGGER, DOMAIN, hass)

    domain_config = config[DOMAIN]
    users = domain_config[CONF_USERS]
    
    entities = []

    for user in users:
        user_name = user[CONF_NAME]
        
        # Create stars counter
        stars_entity = UserStarsEntity(hass, user_name)
        entities.append(stars_entity)

        # Create role entity
        role_entity = UserRoleEntity(hass, user_name, user[CONF_ROLE], user.get('usericon'))
        entities.append(role_entity)

        # Create task entities
        for task_config in user[CONF_TASKS]:
            task_name = task_config[CONF_NAME]
            config = {
                "icon": task_config[CONF_ICON],
                "unique_id": f"{DOMAIN}_{user_name}_{task_name}"
            }
            attributes = {
                "days": task_config[CONF_DAYS],
                "color": task_config.get(CONF_COLOR, "blue"),
                "description": task_config.get(CONF_DESCRIPTION, "")
            }
            task_entity = TaskEntity(hass, user_name, task_name, config, attributes)
            entities.append(task_entity)

    # Add entities using EntityComponent
    await component.async_add_entities(entities)
    hass.data[DOMAIN]["entities"] = entities

    # Register task control services
    async def async_handle_turn_on(call):
        """Handle turn on service call."""
        entity_id = call.data.get('entity_id')
        if not entity_id:
            return
        
        for entity in hass.data[DOMAIN]["entities"]:
            if entity.entity_id == entity_id and isinstance(entity, TaskEntity):
                entity._state = True
                entity.async_write_ha_state()

    async def async_handle_turn_off(call):
        """Handle turn off service call."""
        entity_id = call.data.get('entity_id')
        if not entity_id:
            return
        
        for entity in hass.data[DOMAIN]["entities"]:
            if entity.entity_id == entity_id and isinstance(entity, TaskEntity):
                entity._state = False
                entity.async_write_ha_state()

    async def async_handle_set_stars(call):
        """Handle set stars service call."""
        entity_id = call.data.get('entity_id')
        value = call.data.get('value', 0)
        
        for entity in hass.data[DOMAIN]["entities"]:
            if entity.entity_id == entity_id and isinstance(entity, UserStarsEntity):
                await entity.async_set_value(value)

    # Register services
    async def handle_reset_tasks(call):
        """Reset all tasks to incomplete."""
        for entity in hass.data[DOMAIN]["entities"]:
            if isinstance(entity, TaskEntity):
                entity._state = False
                entity.async_write_ha_state()

    async def handle_reset_rewards(call):
        """Reset all rewards to zero."""
        for entity in hass.data[DOMAIN]["entities"]:
            if isinstance(entity, UserStarsEntity):
                await entity.async_set_value(0)
    
    hass.services.async_register(DOMAIN, "turn_on", async_handle_turn_on)
    hass.services.async_register(DOMAIN, "turn_off", async_handle_turn_off)
    hass.services.async_register(DOMAIN, "set_stars", async_handle_set_stars)
    hass.services.async_register(DOMAIN, "reset_tasks", handle_reset_tasks)
    hass.services.async_register(DOMAIN, "reset_rewards", handle_reset_rewards)

    return True
