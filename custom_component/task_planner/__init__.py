        
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
